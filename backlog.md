# ZapHub Backlog

Lista consolidada das funcionalidades que ainda precisamos implementar para igualar o ZapHub a um gateway WhatsApp completo (baseado no levantamento do `whatsapp.baileys.service.ts`). Use este arquivo para priorizar, abrir issues e acompanhar o progresso.

## 0. Fila de prioridades (ordem sugerida)

1. **Recibos e status de mensagens (`messages.update` / `message-receipt.update`)**  
   - Desbloqueia o Chatwoot (remove “relógio”), garante `message.delivered`/`message.read`.
2. **Filtragem de status/stories e melhorias no `messages.upsert`**  
   - Evita inundar o Chatwoot com status; prepara base para polls/edições.  
3. **Workers de presença e events adicionais (presença + status stories)**  
   - Necessário para UX “digitando”/online e para parar de enviar status como mensagens.  
4. **Modelagem de chats/contacts/groups + webhooks correspondentes**  
   - Base para labels, importações e sincronização futura.  
5. **Pipeline de mídia (download/upload/S3) e metadados de conteúdo**  
   - Garante que mensagens com mídia tenham URLs/dados completos.  
6. **Labels + chamadas + eventos avançados (delete/edit/poll)**  
   - Dá paridade com o serviço referência e habilita funcionalidades de CRM.  
7. **Integrações avançadas (Chatwoot import/sync, STT, tutorials, Postman)**  
   - Finaliza a DX/documentação e prepara o ecossistema externo.

## 1. Eventos do Baileys ainda não tratados

- **`messaging-history.set`**  
  - Importar histórico de chats/contatos/mensagens ao conectar.  
  - Persistir em banco (quando feature estiver habilitada) e evitar duplicados nas filas/webhooks.  
  - Integrar com futuros módulos de Chatwoot (import em massa).

- **`messages.update` / `message-receipt.update`**  
  - Atualizar status no banco (`sent`, `delivered`, `read`).  
  - Expor webhooks específicos (ex.: `message.delivered`, `message.read`).  
  - Gravar eventos em `events` e permitir consultas/relatórios.  
  - Garantir que os webhooks de recibo usem o mesmo `messageId`/`waMessageId` enviado em `message.sent`, para que o Chatwoot possa atualizar o status (removendo o “relógio”).  
  - Validar que as entregas estão apontando para o mesmo `channel_id` configurado no Chatwoot.  
  - (Depois) sincronizar com Chatwoot.

- **`messages.delete`, `messages.edit`, `pollUpdates`**  
  - Detectar `protocolMessage`/`editedMessage`.  
  - Atualizar registros existentes e enviar webhooks `message.deleted` / `message.edited`.  
  - Suporte a enquetes (tanto criação quanto votos).

- **`presence.update`**  
  - Implementar worker para `presenceQueue`.  
  - Encaminhar eventos `presence.*` via webhook (typing, recording, online/offline).

- **Chats / Contatos / Grupos / Labels**  
  - `chats.upsert`, `chats.update`, `chats.delete`.  
  - `contacts.upsert`, `contacts.update`.  
  - `groups.upsert`, `groups.update`, `group-participants.update`.  
  - `labels.edit`, `labels.association`.  
  - Cada evento precisa persistir em tabelas dedicadas e disparar webhooks/documentação.

- **Chamadas (`call`)**  
  - Ler eventos de chamada (ofertas/aceites).  
  - Implementar políticas de rejeição automática/mensagem automática.  
  - Registrar no banco / emitir webhooks ricos (direção, participantes, duração).

## 2. Banco e cache

- Modelar tabelas para **chats**, **contacts**, **groups**, **participants**, **labels**, **media** e relacionamentos.  
- Adicionar migrações e repositórios para CRUD completo.  
- Implementar cache "on-whatsapp" para resolver JIDs `@lid` com apoio do Baileys (`saveOnWhatsappCache`).  
- Guardar metadados adicionais (pushName, profile picture) para reuso em webhooks/integrações.
- Incluir suporte completo a **status/stories**:  
  - Envio de stories (`status@broadcast`) reaproveitando `statusJidList` como o Baileys exige.  
  - Armazenamento/consulta dos próprios status enviados (para expiração/apagamento).  
  - Endpoint para apagar status (seguir capacidade do Baileys: apagar por ID ou expirar).  
  - Filtragem para não repassar status recebidos como mensagens normais (já planejado na fila de prioridades).

## 3. Pipeline de mídia e envio

- **Download/Upload**  
  - Baixar mídia recebida (com fallback) e salvar em S3/MinIO quando configurado.  
  - Guardar URL no banco e incluir nos webhooks.

- **Conversões**  
  - Áudio → texto (STT) usando provedor configurável (OpenAI etc.).  
  - ffmpeg para conversão (ogg/mp3/mp4/webp).  
  - Extração de duração (mediainfo).

- **Envio com typing/presença**  
  - Simular `typing`/`paused` ao enviar mensagens.  
  - Suporte a mentions/quoted/status/list buttons/polls/stickers (seguir API do Baileys).

## 4. Integrações externas

- **Chatwoot**  
  - Documentar todos os webhooks e disponibilizar endpoints de import/sync.  
  - Expor payloads ricos (direction, fromMe, participants, media URL).  
  - Publicar tutorial ensinando a consumir cada evento (responsabilidade do Chatwoot aplicar, mas precisamos entregar o guia).

- **Webhooks genéricos**  
  - Padronizar payloads para cada evento (session, message, chat, contact, presence, call, label).  
  - Permitir configurações de assinatura (quais eventos um cliente quer receber).

- **Outros serviços**  
  - Planejar integração com STT (OpenAI) e outros processadores opcionais (p. ex., tradutores ou bots).

## 5. Documentação e DX

- Atualizar `docs/CHATWOOT_INTEGRATION.md` com a nova matriz de eventos/payloads.  
- Criar guia “Como consumir os webhooks do ZapHub” para terceiros (Chatwoot, CRMs).  
- Produzir exemplos Postman / scripts mostrando o novo fluxo end-to-end (import → receber mensagem → enviar → status).

## 6. Pre-documentação para Chatwoot

Enquanto implementamos cada bloco acima, o Chatwoot já pode se preparar seguindo este protocolo (fonte da verdade provisória):

### 6.1 Estrutura padrão de webhook
- `POST` para a URL configurada em cada sessão.  
- Headers principais:  
  - `X-ZapHub-Event`: nome do evento (`message.sent`, `chat.updated`, etc.).  
  - `X-ZapHub-Session`: UUID da sessão.  
  - `X-ZapHub-Delivery`: ID único da entrega.  
- Body JSON:
  ```json
  {
    "event": "message.sent",
    "sessionId": "uuid",
    "payload": { ... },
    "timestamp": "ISO-8601",
    "deliveryId": "string",
    "attempt": 1
  }
  ```
- Retries automáticos (3 tentativas com backoff exponencial). Responder `2xx` para marcar como entregue.

### 6.2 Eventos previstos e campos obrigatórios

| Categoria  | Evento | Payload mínimo | Observações |
|-----------|--------|----------------|-------------|
| Sessão | `session.qr_generated`, `session.connected`, `session.disconnected`, `session.logged_out` | `status`, `qr` (quando houver), `timestamp`, `reason` (se erro) | Já existem; manteremos formato. |
| Mensagens | `message.receive.queued`, `message.received`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.deleted`, `message.edited` | `messageId` (UUID interno), `waMessageId`, `remoteJid`, `from`, `to`, `type`, `content`, `timestamp`, `direction` (`incoming/outgoing`), `fromMe` (bool), `participant` (em grupos), `media` (URL + metadata quando houver) | Chatwoot deve usar `event` + `direction` + `fromMe` para posicionar o balão. Para grupos, utilizar `participant`/`author` para identificar o remetente. |
| Status / Receipts | `message.receipt.updated` | `waMessageId`, `status` (`sent/delivered/read`), `timestamp`, `remoteJid` | Atualiza status da mensagem já existente; Chatwoot pode mapear para checkmarks. |
| Presença | `presence.update` | `remoteJid`, `participant`, `presence` (`composing`, `recording`, `available`, `unavailable`), `timestamp` | Usar para mostrar “digitando” ou status online. |
| Chats | `chat.upsert`, `chat.update`, `chat.delete` | `chatId`, `name`, `unreadCount`, `mute`, `archived`, `lastMessage` etc. | Permite criar/atualizar registros locais; `chat.delete` inclui motivo. |
| Contatos | `contact.upsert`, `contact.update` | `jid`, `phoneNumber`, `name`, `pushName`, `profileImageUrl` | Ajuda a manter agenda local sincronizada. |
| Grupos | `group.upsert`, `group.update`, `group.participants.update` | `groupId`, `name`, `description`, `participants` (lista com `jid`, `phoneNumber`, `name`, `imageUrl`, `role`) | Útil para atualizar lista de membros no Chatwoot. |
| Labels | `label.edit`, `label.association` | `labelId`, `name`, `color`, `action` (`added`/`removed`), `chatId` | Chatwoot pode refletir tags. |
| Chamadas | `call.offered`, `call.rejected`, `call.ended` | `callId`, `remoteJid`, `direction`, `timestamp`, `duration`, `reason` | Para logar/mostrar chamadas no atendimento. |

### 6.3 Convenções importantes
- **JIDs**  
  - Sempre enviaremos JIDs completos (`55349...@s.whatsapp.net` ou `...@g.us`).  
  - Em casos de `@lid`, resolveremos para `senderPn` antes do webhook (já parcialmente implementado).  
  - `ownerJid`/`ownerLid` identificam o agente (numero do ZapHub).
- **Direção / Remetente**  
  - `direction` = `incoming` quando o contato fala, `outgoing` quando o agente fala (via API ou celular ligado à mesma sessão).  
  - `fromMe`/`from_me`/`is_from_me`/`sent_by_me` = `true` se o agente mandou (ZapHub envia todos esses aliases).  
  - `from` aponta para quem realmente escreveu a mensagem (participante).  
  - `to` aponta para o destinatário (contato ou agente, dependendo da direção).  
  - Em grupos, `participant` e `author` repetem o remetente; `groupId`, `groupName`, `groupImageUrl` trazem o contexto.
- **Conteúdo / Mídia**  
  - Campo `content` mantém o formato específico de cada tipo (text/media template).  
  - Quando houver mídia, adicionaremos `media` com `url`, `type`, `mime`, `size`, `duration`.  
  - Se o cliente habilitar base64 inline, o mesmo campo trará `base64` (mas recomendação é usar `media.url`).
- **Status / Receipts**  
  - Ao receber `message.sent`, Chatwoot pode criar o registro do agente.  
  - `message.delivered` e `message.read` devem atualizar o status da mensagem associada a `waMessageId`.  
  - `message.failed` trará `errorMessage` e `attempts`.
- **Presença**  
  - `presence.update` será frequente; favor tratar idempotente e descartar se não precisar.

> **Dica para recibos**: guardem `messageId`/`waMessageId` retornados em `message.sent`. Quando ZapHub enviar `message.delivered` ou `message.read`, ele reutilizará esse mesmo identificador para que o Chatwoot atualize o status “em progresso” para “entregue/lido”.

### 6.4 Endpoints REST (planejados)

Além dos webhooks, exporemos endpoints REST para consulta/diagnóstico:

- `GET /api/v1/sessions/:id/messages?direction=&status=&type=`  
  - Já existe; será ampliado para incluir filtros por `read/delivered` e paginação com totas.  
- Novos endpoints previstos:  
  - `GET /api/v1/sessions/:id/chats`, `GET /contacts`, `GET /groups` – retornam o espelho local com os mesmos campos enviados nos webhooks.  
  - `GET /api/v1/sessions/:id/events` – listar eventos recentes (mensagens, presença, labels, etc.).  
  - `POST /api/v1/sessions/:id/messages/:messageId/read` – marcar como lida (opcional).  
  - `POST /api/v1/sessions/:id/chats/:chatId/labels` – adicionar/remover label (quando fizermos labels).

### 6.5 Responsabilidade compartilhada

- **ZapHub**  
  - Garantir entrega fiel dos dados e documentar qualquer mudança de payload.  
  - Manter `backlog.md` atualizado à medida que cada evento entra em produção.

- **Chatwoot (ou outro consumidor)**  
  - Consumir webhooks de acordo com esta pre-doc.  
  - Mapear `event + direction + fromMe` para o layout de conversa.  
  - Persistir `messageId` e `waMessageId` para correlacionar updates (status/edições).  
  - Tratar idempotência (entregas duplicadas podem acontecer em caso de retry).

> **Nota:** à medida que cada funcionalidade for concluída, moveremos estas instruções para a documentação oficial (`docs/CHATWOOT_INTEGRATION.md`) e daremos versionamento aos payloads.

---

**Como usar este backlog**  
- Priorize cada seção conforme impacto/viabilidade.  
- Para cada item, abra uma issue descrevendo requisitos, checklist de testes e impacto em API/webhooks.  
- Atualize o arquivo conforme funcionalidades forem concluídas ou novas necessidades surgirem.
