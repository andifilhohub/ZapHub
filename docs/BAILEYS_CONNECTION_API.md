# Guia da API de Conexão com a Baileys (ZapHub)

Este documento descreve como o ZapHub usa a biblioteca [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) para oferecer múltiplas sessões simultâneas de WhatsApp, detalhando fluxos internos, filas, workers e a API HTTP exposta. Use-o como referência para operar, extender ou diagnosticar o módulo de conexão.

---

## 1. Panorama da arquitetura

| Componente | Responsabilidade principal | Implementação |
|------------|----------------------------|---------------|
| `ConnectionManager` | Mantém sockets Baileys por sessão, gerencia QR, reconexão e roteia eventos | `src/core/ConnectionManager.js` |
| API HTTP v1 | CRUD de sessões, envio de mensagens, monitoria e webhooks | `src/api/**/*` e `src/server/app.js` |
| Filas BullMQ | Desacoplam inicialização, envio/recebimento de mensagens e entrega de webhooks | `src/lib/queueManager.js`, `src/lib/queues/*.js` |
| Workers | Consumidores das filas (session, message, webhook, eventos nativos) | `src/workers/**/*` |
| Persistência | Postgres guarda sessões, mensagens, eventos e chamadas | migrations em `src/db/migrations` e repositórios `src/db/repositories/*` |
| Redis | Backend de filas (BullMQ) e rate-limiting | configurado em `config/index.js` |

Fluxo alto nível:

1. **API** recebe uma requisição (por ex. `POST /api/v1/sessions`).
2. Controladores validam payloads (Joi) e gravam registros base.
3. Jobs são enfileirados no Redis.
4. **Workers** consomem jobs e usam o `ConnectionManager` para iniciar sockets ou disparar mensagens.
5. Eventos importantes são gravados em Postgres e, se existir `webhook_url`, são entregues via `webhookWorker`.
6. Métricas podem ser extraídas via `events`, `messages` e logs Pino.

---

## 2. Pré-requisitos & setup

### 2.1 Infraestrutura necessária

- Node.js 18+ (vide `package.json`).
- Postgres 14+ com banco `zaphub` (scripts `src/db/createDb.js`, `src/db/migrate.js`).
- Redis 6+ (BullMQ). O endereço é configurado em `.env`.
- Dependências instaladas: `npm install`.

### 2.2 Variáveis de ambiente principais

Defina um `.env` baseado no `.env.example`:

| Variável | Uso |
|----------|-----|
| `PORT` | Porta HTTP do servidor Express.
| `DB_*` | Conexão Postgres.
| `REDIS_*` | Conexão BullMQ.
| `AUTH_DATA_DIR` | Pasta base onde cada sessão armazena seus arquivos multi-device (padrão `./auth_data`).
| `MAX_CONCURRENT_SESSIONS` | Limite global para sockets simultâneos.
| `API_KEY_ENABLED`/`API_KEY` | Ativam o middleware de autenticação via header Bearer ou query `api_key`.
| `WEBHOOK_*` | Timeout e política de retry para entregas de webhooks.

### 2.3 Serviços que devem estar rodando

```bash
# Banco + Redis (ajuste conforme seu ambiente)
postgres -D ... &
redis-server --save "" --appendonly no &

# API HTTP
npm run dev

# Workers principais (session init, send/receive, webhook)
npm run worker

# Workers de eventos nativos (presence, receipts, calls)
npm run worker:events
```

> A API não consome filas diretamente: sem os workers o backend não inicia sessões nem envia mensagens.

### 2.4 Estrutura útil de diretórios

```
src/
├── api/                # Endpoints REST e validações
├── core/               # ConnectionManager e recuperação de sessões
├── db/                 # Client PG, migrações e seeds
├── lib/                # Logger, Redis, queues utilitárias
├── workers/            # Workers BullMQ
└── connections/        # Script standalone startWhatsApp
```

---

## 3. Componentes internos

### 3.1 ConnectionManager (`src/core/ConnectionManager.js`)

- Usa `makeWASocket` com `useMultiFileAuthState` para manter um socket por `sessionId` (dados ficam em `AUTH_DATA_DIR/<sessionId>`).
- Atualiza a tabela `sessions` a cada mudança (`status`, `qr_code`, `retry_count`, timestamps) e cria eventos (`session.*`).
- Controla reconexão automática com backoff exponencial (`retryBaseDelay = 5s`, `maxRetries = 5`).
- Escuta eventos Baileys (`messages.upsert`, `presence.update`, `message-receipt.update`, `call`, `groups.update`, etc.) e delega para filas/DB.
- Exponibiliza operações síncronas: `startSession`, `stopSession`, `sendMessage`, `isConnected`, `getStatus`, `clearAuthData`.

### 3.2 Recuperação de sessões (`src/core/sessionRecovery.js`)

- Ao subir `npm run worker`, o helper busca no Postgres sessões com status `connected`, `reconnecting`, `qr_pending`, `initializing` ou `disconnected` e recria seus sockets.
- Também oferece `shutdownAllSessions` para desligar tudo com segurança em sinais SIGTERM/SIGINT.

### 3.3 Filas & workers

| Fila | Producer | Worker | Propósito |
|------|----------|--------|-----------|
| `session-init` | `createSessionController`, `restartSessionController` | `sessionInitWorker` | Inicializa sockets (gera QR, conecta, atualiza status).
| `session-close` | `deleteSessionController`, operações internas | (*worker a implementar*) | Agendado para logouts / encerramentos.
| `message-send` | `enqueueSendMessage` (mensagens outbound) | `messageSendWorker` | Baixa mídia via HTTP quando necessário e chama `ConnectionManager.sendMessage`.
| `message-receive` | `ConnectionManager.handleMessagesUpsert` | `messageReceiveWorker` | Persiste mensagens inbound e dispara webhooks.
| `presence-events` | `ConnectionManager.handlePresenceUpdate` | `presence-event.worker` | Normaliza presenças e envia webhooks.
| `receipt-events` | `ConnectionManager.handleMessageReceipts` | `receipt-event.worker` | Atualiza status `delivered/read` e chama webhooks.
| `call-events` | `ConnectionManager.handleCallEvents` | `call-event.worker` | Persistência de chamadas e webhooks.
| `webhook-delivery` | `enqueueWebhookForEvent` | `webhookWorker` | Entrega HTTP com retry exponencial.

Outros utilitários: `src/lib/queueMetrics.js` para inspeção/limpeza e `src/lib/queues/eventQueues.js` (filas dedicadas para presenças, recibos e chamadas).

### 3.4 Persistência

- **sessions**: estado da sessão, QR atual, webhook, contadores de retry e timestamps.
- **messages**: histórico inbound/outbound com idempotência (`message_id`), status (`queued`, `processing`, `sent`, `delivered`, `read`, `failed`, `dlq`), payload e metadados.
- **events**: trilha de auditoria genérica; cada worker grava eventos ricos (`event_type`, `event_category`, `payload`).
- **calls**: log específico de chamadas (voz/vídeo) com `call_id`, `status`, `latency_ms`.

### 3.5 Webhooks

- Configure `webhook_url` na sessão para receber POSTs assíncronos.
- `webhookWorker` envia payloads JSON com cabeçalhos `X-ZapHub-*`. Respostas não 2xx causam retries automáticos (até 3, backoff exponencial).
- Endpoints de apoio: `POST /api/v1/sessions/:id/webhook/test`, `GET /api/v1/sessions/:id/webhook/events` e `POST /api/v1/sessions/:id/webhook/retry`.

---

## 4. Ciclo de vida de uma sessão

1. **Criação** – `POST /api/v1/sessions` grava registro em `sessions` (status `initializing`) e enfileira `session-init`.
2. **Inicialização** – `sessionInitWorker` chama `ConnectionManager.startSession`, que gera `session.initializing` e abre socket.
3. **QR code** – Quando Baileys emite `connection.update` com `qr`, o status vira `qr_pending`, o QR é salvo (texto) e um evento `session.qr_generated` é registrado/webhookado.
4. **Autenticação** – Após escanear, `connection === 'open'` muda status para `connected`, zera `retry_count`, dispara `session.connected` e atualiza `connected_at`/`last_seen`.
5. **Recepção/Envio** – Mensagens entram e saem via `ConnectionManager`, passando por filas adequadas.
6. **Quedas** – Se `connection === 'close'`, o motivo é identificado (`DisconnectReason`). Se não for `loggedOut`, agenda reconexão com `session.reconnecting`; se for logout, limpa `auth_data` e marca `logged_out`.
7. **Encerramento manual** – `POST /api/v1/sessions/:id/restart` ou `DELETE /api/v1/sessions/:id` param o socket via `stopSession` e (opcional) removem credenciais.

Estados possíveis (validados em `sessionValidators`): `initializing`, `qr_pending`, `connected`, `disconnected`, `reconnecting`, `failed`, `logged_out`.

---

## 5. API HTTP v1

### 5.1 Autenticação

- Ative via `.env` (`API_KEY_ENABLED=true`).
- Envie `Authorization: Bearer <API_KEY>` ou `?api_key=<API_KEY>`.

### 5.2 Endpoints principais

| Método & caminho | Descrição | Payload relevante |
|------------------|-----------|-------------------|
| `GET /api/v1/health` | Health check sem auth. | — |
| `GET /api/v1/sessions/stats` | Ocupação do sistema. | — |
| `POST /api/v1/sessions` | Cria sessão. | `{ "label": "Finance", "webhook_url": "https://...", "config": {...} }` |
| `GET /api/v1/sessions` | Lista sessões (filtros `status`, `limit`, `offset`). | Query |
| `GET /api/v1/sessions/:id` | Detalhes completos (inclui `qr_code`). | — |
| `PATCH /api/v1/sessions/:id` | Atualiza `label`, `webhook_url` ou `config`. | JSON parcial |
| `DELETE /api/v1/sessions/:id` | Remove sessão e agenda logout. | — |
| `GET /api/v1/sessions/:id/qr?format=base64|data_url|raw` | Recupera último QR, valida expiração (~60s). | Query `format` |
| `GET /api/v1/sessions/:id/status` | Une status do DB + runtime do ConnectionManager. | — |
| `POST /api/v1/sessions/:id/restart` | Limpa auth e reinicia ciclo de QR. | — |
| `GET /api/v1/sessions/:id/events` | Lista eventos (`type`, `from`, `to`, paginação). | Query |
| `GET /api/v1/sessions/:id/calls` | Histórico de chamadas (`status`, `is_video`). | Query |
| `POST /api/v1/sessions/:id/presence` | Força `sendPresenceUpdate`. | `{ "jid": "5511...@s.whatsapp.net", "type": "composing" }` |
| `POST /api/v1/sessions/:id/presence/subscribe` | Chama `presenceSubscribe` para monitorar um contato. | `{ "jid": "..." }` |
| `POST /api/v1/sessions/:id/messages` | Enfileira envio. | Ver seção 6 |
| `GET /api/v1/sessions/:id/messages` | Lista mensagens (filtros `status`, `direction`, `type`). | Query |
| `GET /api/v1/sessions/:id/messages/:messageId` | Detalha mensagem específica. | — |
| `POST /api/v1/sessions/:id/webhook/test` | Dispara POST de teste. | `{ "url": "https://...", "event": "webhook.test" }` |
| `GET /api/v1/sessions/:id/webhook/events` | Consulta entregas registradas em `events`. | Query |
| `POST /api/v1/sessions/:id/webhook/retry` | Reenvia manualmente um payload. | `{ "event": "message.received", "payload": {...} }` |
| `GET /api/v1/webhook/events` | Lista todos os `eventType` suportados (útil para geração de UI). | — |

### 5.3 Exemplo de criação de sessão

```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H 'Authorization: Bearer $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
        "label": "Equipe Comercial",
        "webhook_url": "https://acme.test/webhooks/zaphub",
        "config": {
          "markOnlineOnConnect": true,
          "retryLimit": 3
        }
      }'
```

Resposta (201):

```json
{
  "success": true,
  "data": {
    "id": "c1c9c1ae-...",
    "label": "Equipe Comercial",
    "status": "initializing",
    "webhook_url": "https://acme.test/webhooks/zaphub",
    "config": {"markOnlineOnConnect": true, "retryLimit": 3}
  },
  "message": "Session created successfully. Initialization in progress."
}
```

---

## 6. Envio e recebimento de mensagens

### 6.1 Envio

1. `POST /api/v1/sessions/:id/messages` passa pelo `sendMessageController`.
2. O controller valida idempotência (`messageId`) e estado da sessão (`qr_pending` ou `connected`).
3. `enqueueSendMessage` grava o registro em `messages` (status `queued`) e adiciona job em `message-send` com `jobId = msg-send-<dbId>`.
4. `messageSendWorker`:
   - Atualiza status `processing`.
   - Faz download de mídias HTTP (até 50 MB) quando URL é informada.
   - Chama `ConnectionManager.sendMessage`, que trata casos especiais (por ex. `status@broadcast` precisa de `statusJidList`).
   - Atualiza status `sent` + `wa_message_id`/`wa_timestamp`.
   - Registra `message.sent` em `events` e possivelmente envia webhook.
5. Falhas incrementam `attempts`; após atingir `job.opts.attempts`, a mensagem vira `dlq`.

Exemplo mínimo (texto):

```bash
curl -X POST http://localhost:3000/api/v1/sessions/<SESSION_ID>/messages \
  -H 'Authorization: Bearer $API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
        "messageId": "ticket-9823",
        "to": "5511987654321@s.whatsapp.net",
        "type": "text",
        "text": "Olá, podemos seguir com o atendimento?",
        "metadata": {"ticket": "#9823"}
      }'
```

### 6.2 Recebimento

- `ConnectionManager.handleMessagesUpsert` ignora mensagens `fromMe`, extrai conteúdo (texto, imagem, áudio, etc.) e chama `enqueueReceiveMessage`.
- `messageReceiveWorker` persiste inbound (`direction = inbound`, `status = delivered`) e dispara evento `message.received` + webhook, se configurado.
- Use `GET /api/v1/sessions/:id/messages?direction=inbound` ou `GET /api/v1/sessions/:id/events?type=message` para auditoria.

### 6.3 Status & recibos

- `receipt-event.worker` traduz `message-receipt.update` em `message.receipt.delivered` ou `.read` e tenta atualizar o registro em `messages` (`delivered_at`, `read_at`).
- Webhooks recebem payload com `messageId`, `remoteJid`, timestamps em ms e `receiptType`.

---

## 7. Eventos & webhooks

### 7.1 Tipos de evento gerados

| Categoria | Eventos (exemplos) | Origem |
|-----------|--------------------|--------|
| Sessão | `session.initializing`, `session.qr_generated`, `session.connected`, `session.reconnecting`, `session.logged_out`, `session.stopped`, `session.start_failed` | `ConnectionManager` |
| Mensagens | `message.send.queued`, `message.sent`, `message.moved_to_dlq`, `message.receive.queued`, `message.received`, `message.reaction` | Controllers, workers, ConnectionManager |
| Presença | `presence.update` | `presence-event.worker` |
| Recibos | `message.receipt.delivered`, `message.receipt.read` | `receipt-event.worker` |
| Chamadas | `call.offer`, `call.ringing`, `call.accept`, `call.reject`, `call.terminate` | `call-event.worker` |
| Grupos | `group.participants.add|remove|promote|demote`, `group.update` | `ConnectionManager` |
| Webhook | `webhook.delivery.queued`, `webhook.delivered`, `webhook.failed` | `webhookQueue`/`webhookWorker` |

Consulte `GET /api/v1/webhook/events` para a lista atualizada conforme o código.

### 7.2 Estrutura do payload webhook

```json
{
  "event": "message.received",
  "sessionId": "<uuid>",
  "payload": {
    "messageId": "wamid.HBgL...",
    "from": "55119...@s.whatsapp.net",
    "type": "text",
    "content": {"text": "Oi"},
    "timestamp": 1735757564
  },
  "timestamp": "2024-12-31T23:59:59.123Z",
  "deliveryId": "1678795955057-0-3"
}
```

Cabeçalhos: `X-ZapHub-Event`, `X-ZapHub-Session`, `X-ZapHub-Delivery`, além do `User-Agent: ZapHub-Webhook/1.0`.

### 7.3 Testes e retries

- `POST /api/v1/sessions/:id/webhook/test` envia um payload de teste (pode sobrescrever `url`).
- `GET /api/v1/sessions/:id/webhook/events?status=failed` mostra históricos registrados na tabela `events`.
- `POST /api/v1/sessions/:id/webhook/retry` permite reenviar manualmente qualquer evento/payload.

---

## 8. Operações em tempo real

- `GET /api/v1/sessions/:id/status` combina status persistido + runtime (`connected`, `connecting`, `disconnected`).
- `POST /api/v1/sessions/:id/presence` expõe `socket.sendPresenceUpdate` (tipos suportados: `composing`, `recording`, `available`, `unavailable`).
- `POST /api/v1/sessions/:id/presence/subscribe` chama `socket.presenceSubscribe` para acompanhar status de um JID específico.
- Use `GET /api/v1/sessions/:id/events?type=presence` para auditar quem está online/typing.

---

## 9. Modo standalone e rotas legadas

- O script `src/connections/baileys/index.js` permite testar rapidamente uma sessão única (armazenando credenciais em `auth_data`). Execute `node src/connections/baileys/index.js` e escaneie o QR impresso no terminal. O handler padrão responde "pong" quando recebe "ping".
- A rota Express `GET /baileys/send-message` (definida em `src/routes/routes.js`) é um atalho básico para enviar mensagens sem passar pela pipeline completa. Ela depende de `startWhatsApp()` inicializado no próprio arquivo. Use apenas para testes pontuais; em produção utilize a API `/api/v1/sessions/:id/messages`.

---

## 10. Dicas de troubleshooting

- **Sessão fica em `qr_pending`**: confirme se o worker está rodando (`npm run worker`) e se o relógio do servidor não expirou o QR (requisite `/api/v1/sessions/:id/qr` em até 60s).
- **`logged_out` após reconexão**: as credenciais foram invalidadas. Chame `POST /api/v1/sessions/:id/restart` para limpar `auth_data` e gerar novo QR.
- **Mensagens em `dlq`**: verifique a coluna `error_message` em `messages` e os eventos `message.moved_to_dlq`. Normalmente causado por sessão desconectada ou download de mídia falho.
- **Webhook não chega**: cheque a fila `webhook-delivery` (`redis-cli`, Bull Board ou `getWebhookEvents`). O worker respeita `WEBHOOK_TIMEOUT_MS` e falhará se o endpoint demorar mais que isso.
- **Limite de sessões**: parâmetro `MAX_CONCURRENT_SESSIONS` governa `ConnectionManager.startSession`; aumente com cautela e monitore `GET /api/v1/sessions/stats`.

---

## 11. Próximos passos comuns

- Automatizar monitoramento lendo a tabela `events` ou plugando Prometheus (expondo métricas BullMQ).
- Construir UI para QR codes consumindo `GET /api/v1/sessions/:id/qr?format=data_url`.
- Implementar worker `session-close` caso precise de logouts programados.

---

### Check-list rápido

- [ ] `.env` preenchido e migrations rodadas (`npm run db:migrate`).
- [ ] API (`npm run dev`) + workers (`npm run worker` e `npm run worker:events`) ativos.
- [ ] Sessões gerenciadas exclusivamente via `/api/v1/sessions`.
- [ ] `webhook_url` definido para cada sessão que precisa de eventos.

Com isso você consegue subir, operar e estender a API de conexão Baileys do ZapHub.
