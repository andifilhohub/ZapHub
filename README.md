# ZapHub — Plataforma WhatsApp Multi-Conexões

API robusta e escalável para gerenciar múltiplas conexões WhatsApp usando Baileys, com suporte a filas, retry, idempotência e sistema completo de webhooks.

## 🎯 Visão Geral

**ZapHub** permite gerenciar dezenas ou centenas de conexões WhatsApp simultaneamente através de uma API REST moderna. Ideal para:
- 🏢 Suporte multi-atendimento
- 📱 Automação de mensagens
- 🤖 Chatbots e assistentes virtuais
- 📊 CRM e integrações empresariais
- 🔔 Notificações em tempo real via webhooks

## 🏆 Status do Projeto: 7/12 Etapas Concluídas

✅ **Etapa 1**: Configuração de infraestrutura  
✅ **Etapa 2**: Database schema & migrations (3 tabelas, repositories)  
✅ **Etapa 3**: Sistema de filas BullMQ (5 filas com retry)  
✅ **Etapa 4**: Connection Manager (Baileys lifecycle, auto-recovery)  
✅ **Etapa 5**: API Sessions CRUD (8 endpoints, auth, validação)  
✅ **Etapa 6**: API Messages (9 tipos de mensagem, idempotência)  
✅ **Etapa 7**: Workers & Webhooks (4 workers, sistema de retry)  
⏳ **Etapa 8**: Observabilidade (Prometheus, Grafana)  
⏳ **Etapa 9-12**: Testes, Docker, Segurança avançada, UX/DX  

## 🚀 Features Implementadas

### Core Features
- ✅ **Múltiplas sessões WhatsApp** simultâneas (100+ conexões)
- ✅ **Auto-recovery** de sessões após restart do servidor
- ✅ **QR Code** com expiração automática
- ✅ **Reconexão automática** com backoff exponencial (5s → 80s)
- ✅ **9 tipos de mensagem**: text, image, video, audio, document, location, contact, reaction, template
- ✅ **Idempotência** via `messageId` (previne duplicação)
- ✅ **Status em tempo real**: queued → processing → sent → delivered → read

### API REST (15 Endpoints)
- ✅ **Sessions**: CREATE, LIST, GET, UPDATE, DELETE, QR, STATUS, RESTART
- ✅ **Messages**: SEND, LIST, GET (com filtros e paginação)
- ✅ **Webhooks**: TEST, GET_EVENTS, RETRY, GET_EVENT_TYPES
- ✅ **Health Check**: /health endpoint

### Sistema de Filas & Workers
- ✅ **BullMQ** integrado com Redis
- ✅ **5 Filas**: session-init, session-close, message-send, message-receive, webhook-delivery
- ✅ **4 Workers** em paralelo (concurrency: 3-10)
- ✅ **Retry automático** com backoff exponencial (2s → 8s, 3 tentativas)
- ✅ **DLQ** (Dead Letter Queue) para falhas persistentes

### Webhooks & Notificações
- ✅ **8 tipos de eventos**: session.qr_updated, session.connected, session.disconnected, message.received, message.sent, message.delivered, message.read, message.failed
- ✅ **Retry inteligente**: 3 tentativas com backoff (2s → 4s → 8s)
- ✅ **Headers customizados**: X-ZapHub-Event, X-ZapHub-Session, X-ZapHub-Delivery
- ✅ **Teste de webhook**: endpoint para validar URL antes de configurar
- ✅ **Histórico completo**: auditoria de todos os webhooks entregues/falhados
- ✅ **Retry manual**: reenviar webhooks falhados via API

### Segurança & Validação
- ✅ **API Key Authentication** (Bearer token ou query param)
- ✅ **Validação rigorosa** com Joi (15+ schemas)
- ✅ **CORS** configurável
- ✅ **Error handling** centralizado
- ✅ **Request logging** estruturado (JSON/Pino)

### Database & Persistência
- ✅ **PostgreSQL** com 3 tabelas (sessions, messages, events)
- ✅ **Migrations** versionadas
- ✅ **Seeds** para dados de teste
- ✅ **Repositories pattern** (abstração de queries)
- ✅ **Índices otimizados** para performance

## 📋 Pré-requisitos

- **Node.js** >= 18.x
- **PostgreSQL** >= 14.x  
- **Redis** >= 7.x

## 🛠️ Instalação Rápida

### 1. Clone e instale dependências
```bash
cd /home/anderson/workspace/zaphub
npm install
```

### 2. Configure variáveis de ambiente (.env)
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zaphub
DB_USER=postgres
DB_PASSWORD=postgresql

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Security
API_KEY_ENABLED=true
API_KEY=your-secret-api-key-change-in-production

Note: em produção mantenha `API_KEY_ENABLED=true` e defina `API_KEY` para um segredo forte; todas as rotas autenticadas exigem o header `Authorization: Bearer <API_KEY>` (ou `?apiKey=`) conforme o middleware central.

# Webhook
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_SIGNATURE_SECRET=Chave/HMAC-de-64-caracteres

# Baileys simples (rota legado /baileys)
BAILEYS_WEBHOOK_URL=https://example.com/webhook
BAILEYS_WEBHOOK_TIMEOUT_MS=10000
```

### 3. Setup do banco de dados
```bash
# Criar database
npm run db:create

# Executar migrations
npm run db:migrate

# (Opcional) Seed com dados de teste
npm run db:seed
```

### 4. Inicie os serviços

**Terminal 1 - API Server**:
```bash
npm run dev
# ou produção: node src/server/app.js
```

**Terminal 2 - Workers**:
```bash
node src/workers/index.js
```

**Terminal 3 - Redis** (se necessário):
```bash
docker run -d -p 6379:6379 redis:alpine
# ou: redis-server
```

## 🚦 Testando a API

### 1. Health Check
```bash
curl http://localhost:3000/api/v1/health
```

### 2. Criar uma sessão WhatsApp
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Minha Primeira Sessão",
    "webhook_url": "https://webhook.site/your-unique-id"
  }'
```

### 3. Obter QR Code
```bash
curl http://localhost:3000/api/v1/sessions/{SESSION_ID}/qr \
  -H "Authorization: Bearer your-secret-api-key-change-in-production"
```

### 4. Enviar mensagem de texto
```bash
curl -X POST http://localhost:3000/api/v1/sessions/{SESSION_ID}/messages \
  -H "Authorization: Bearer your-secret-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-001",
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Olá do ZapHub! 🚀"
  }'
```

## 📚 Estrutura do Projeto

```
zaphub/
├── config/
│   └── index.js                         # Configuração centralizada
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── sessionController.js     # 8 controllers de sessões
│   │   │   ├── messageController.js     # 3 controllers de mensagens
│   │   │   └── webhookController.js     # 4 controllers de webhooks
│   │   ├── validators/
│   │   │   ├── sessionValidators.js     # Joi schemas (5)
│   │   │   ├── messageValidators.js     # Joi schemas (9 tipos)
│   │   │   └── webhookValidators.js     # Joi schemas (3)
│   │   ├── middleware/
│   │   │   ├── auth.js                  # API Key authentication
│   │   │   ├── validate.js              # Joi validation wrapper
│   │   │   ├── errorHandler.js          # Error handling centralizado
│   │   │   └── index.js
│   │   └── routes/
│   │       ├── index.js                 # Router principal
│   │       ├── sessions.js              # /api/v1/sessions/*
│   │       ├── messages.js              # /api/v1/sessions/:id/messages/*
│   │       └── webhooks.js              # /api/v1/sessions/:id/webhook/*
│   ├── core/
│   │   ├── ConnectionManager.js         # 738 linhas - Baileys lifecycle
│   │   ├── sessionRecovery.js           # Auto-recovery de sessões
│   │   └── index.js
│   ├── db/
│   │   ├── client.js                    # PostgreSQL client
│   │   ├── migrations/
│   │   │   ├── 001_create_sessions.sql
│   │   │   ├── 002_create_messages.sql
│   │   │   └── 003_create_events.sql
│   │   ├── seeds/
│   │   │   └── seed.sql                 # Dados de teste
│   │   └── repositories/
│   │       ├── sessions.js              # CRUD sessions
│   │       ├── messages.js              # CRUD messages
│   │       ├── events.js                # CRUD events
│   │       └── index.js
│   ├── lib/
│   │   ├── logger.js                    # Pino logger (JSON structured)
│   │   ├── redis.js                     # Redis client
│   │   ├── errors.js                    # Custom error classes
│   │   ├── queueManager.js              # BullMQ manager
│   │   ├── queueNames.js                # Queue name constants
│   │   └── queues/
│   │       ├── index.js
│   │       ├── sessionQueue.js          # session-init, session-close
│   │       ├── messageQueue.js          # message-send, message-receive
│   │       └── webhookQueue.js          # webhook-delivery
│   ├── server/
│   │   └── app.js                       # Express app setup
│   └── workers/
│       ├── index.js                     # Workers orchestrator
│       ├── sessionInitWorker.js         # Inicializa sessões (concurrency: 5)
│       ├── messageSendWorker.js         # Envia mensagens (concurrency: 5)
│       ├── messageReceiveWorker.js      # Processa recebidas (concurrency: 10)
│       └── webhookWorker.js             # Entrega webhooks (concurrency: 3)
├── auth_data/                           # Baileys auth (gitignored)
│   ├── {sessionId}/
│   │   ├── creds.json
│   │   ├── app-state-sync-key-*.json
│   │   └── pre-key-*.json
├── docs/
│   ├── PRD-whatsapp-architecture.md     # Product Requirement Document
│   └── baileys/
│       ├── README.md                    # Índice de documentação
│       ├── etapa-02-database.md         # 6.500 linhas
│       ├── etapa-03-queues.md           # 1.400 linhas
│       ├── etapa-04-connection-manager.md # 1.400 linhas
│       ├── etapa-05-api-sessions.md     # 1.500 linhas
│       ├── etapa-06-api-messages.md     # 1.200 linhas
│       └── etapa-07-workers-webhooks.md # 1.100 linhas
├── package.json
├── .env                                 # Variáveis de ambiente (gitignored)
└── README.md
```

## 🔧 Scripts Disponíveis

```bash
# Development
npm run dev              # Inicia API com nodemon (auto-reload)
npm run dev:workers      # Inicia workers em dev mode

# Production
npm start                # Inicia API server (produção)
node src/workers/index.js # Inicia workers (produção)

# Database
npm run db:create        # Cria database 'zaphub'
npm run db:migrate       # Executa migrations (cria tabelas)
npm run db:seed          # Seed com dados de teste
npm run db:reset         # Drop, create, migrate, seed (reset completo)

# Testing
npm test                 # Executa testes (quando implementado)
npm run test:watch       # Testes em watch mode

# Code Quality
npm run lint             # ESLint
npm run format           # Prettier
```

## 📖 Endpoints da API

### 🔐 Autenticação
Todas as requisições (exceto `/health`) requerem API Key:

**Opção 1**: Header Authorization
```bash
-H "Authorization: Bearer your-secret-api-key"
```

**Opção 2**: Query parameter
```bash
?apiKey=your-secret-api-key
```

---

### 📱 Sessions

#### POST `/api/v1/sessions` - Criar sessão
```json
{
  "label": "Atendimento Vendas",
  "webhook_url": "https://your-app.com/webhook"
}
```
**Resposta**: `201 Created` com `sessionId`

#### GET `/api/v1/sessions` - Listar sessões
**Query params**: `?status=connected&limit=10&offset=0`

#### GET `/api/v1/sessions/:id` - Detalhes da sessão
**Resposta**: Dados completos (status, label, webhook_url, etc.)

#### PATCH `/api/v1/sessions/:id` - Atualizar sessão
```json
{
  "label": "Novo Label",
  "webhook_url": "https://new-url.com/webhook"
}
```

#### DELETE `/api/v1/sessions/:id` - Deletar sessão
**Resposta**: `204 No Content`

#### GET `/api/v1/sessions/:id/qr` - Obter QR Code
**Resposta**: Base64 QR code ou erro se já conectado

#### GET `/api/v1/sessions/:id/status` - Status em tempo real
**Resposta**:
```json
{
  "sessionId": "abc-123",
  "status": "connected",
  "isConnected": true,
  "qr": null,
  "phone": "5511999999999"
}
```

#### POST `/api/v1/sessions/:id/restart` - Reiniciar sessão
**Resposta**: `200 OK` com novo status

---

### 💬 Messages

#### POST `/api/v1/sessions/:id/messages` - Enviar mensagem
**9 tipos suportados**:

**1. Text**
```json
{
  "messageId": "msg-001",
  "to": "5511999999999@s.whatsapp.net",
  "type": "text",
  "text": "Olá! Como posso ajudar?"
}
```

**2. Image**
```json
{
  "messageId": "msg-002",
  "to": "5511999999999@s.whatsapp.net",
  "type": "image",
  "image": {
    "url": "https://example.com/image.jpg",
    "caption": "Confira esta imagem!"
  }
}
```

**3. Video**
```json
{
  "messageId": "msg-003",
  "to": "5511999999999@s.whatsapp.net",
  "type": "video",
  "video": {
    "url": "https://example.com/video.mp4",
    "caption": "Vídeo tutorial",
    "gifPlayback": false
  }
}
```

**4. Audio** (PTT - Push To Talk)
```json
{
  "messageId": "msg-004",
  "to": "5511999999999@s.whatsapp.net",
  "type": "audio",
  "audio": {
    "url": "https://example.com/audio.mp3",
    "ptt": true
  }
}
```

**5. Document**
```json
{
  "messageId": "msg-005",
  "to": "5511999999999@s.whatsapp.net",
  "type": "document",
  "document": {
    "url": "https://example.com/doc.pdf",
    "fileName": "contrato.pdf",
    "mimetype": "application/pdf"
  }
}
```

**6. Location**
```json
{
  "messageId": "msg-006",
  "to": "5511999999999@s.whatsapp.net",
  "type": "location",
  "location": {
    "latitude": -23.5505,
    "longitude": -46.6333,
    "name": "São Paulo, SP"
  }
}
```

**7. Contact** (vCard)
```json
{
  "messageId": "msg-007",
  "to": "5511999999999@s.whatsapp.net",
  "type": "contact",
  "contact": {
    "displayName": "João Silva",
    "vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:João Silva\nTEL:+5511999999999\nEND:VCARD"
  }
}
```

**8. Reaction** (Emoji)
```json
{
  "messageId": "msg-008",
  "to": "5511999999999@s.whatsapp.net",
  "type": "reaction",
  "reaction": {
    "messageId": "BAE5...",
    "emoji": "👍"
  }
}
```

**9. Template** (Business API)
```json
{
  "messageId": "msg-009",
  "to": "5511999999999@s.whatsapp.net",
  "type": "template",
  "template": {
    "name": "hello_world",
    "language": "pt_BR",
    "components": []
  }
}
```

#### GET `/api/v1/sessions/:id/messages` - Listar mensagens
**Query params**: `?status=sent&direction=outbound&limit=20&offset=0`

#### GET `/api/v1/sessions/:id/messages/:messageId` - Detalhes da mensagem

---

### 🔔 Webhooks

#### POST `/api/v1/sessions/:id/webhook/test` - Testar webhook
```json
{
  "url": "https://your-app.com/webhook"
}
```
**Resposta**: Resultado do teste (sucesso/erro, latência, status code)

#### GET `/api/v1/sessions/:id/webhook/events` - Histórico de webhooks
**Query params**: `?status=delivered&limit=50`

#### POST `/api/v1/sessions/:id/webhook/retry` - Retry manual
```json
{
  "event": "message.received",
  "payload": {...}
}
```

#### GET `/api/v1/webhook/events` - Tipos de eventos disponíveis
**Resposta**: Lista dos 8 event types

---

## 🔔 Sistema de Webhooks

### Eventos Disponíveis (8 tipos)

1. **session.qr_updated** - Novo QR code gerado
2. **session.connected** - Sessão conectada com sucesso
3. **session.disconnected** - Sessão desconectada
4. **message.received** - Mensagem recebida
5. **message.sent** - Mensagem enviada com sucesso
6. **message.delivered** - Mensagem entregue ao destinatário
7. **message.read** - Mensagem lida
8. **message.failed** - Falha no envio

### Formato do Webhook

**Request** enviado para seu servidor:
```http
POST https://your-app.com/webhook
Content-Type: application/json
X-ZapHub-Event: message.received
X-ZapHub-Session: abc-123
X-ZapHub-Delivery: delivery-uuid-456
User-Agent: ZapHub-Webhook/1.0

{
  "event": "message.received",
  "sessionId": "abc-123",
  "deliveryId": "delivery-uuid-456",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "payload": {
    "from": "5511999999999@s.whatsapp.net",
    "type": "text",
    "content": {
      "text": "Olá!"
    },
    "messageId": "BAE5..."
  }
}
```

### Retry Logic

- **Tentativa 1**: Imediata
- **Tentativa 2**: Após 2 segundos
- **Tentativa 3**: Após 4 segundos (total 6s acumulado)

Se todas as tentativas falharem, o evento é marcado como `webhook.failed` e pode ser retentado manualmente via API.

### Exemplo de Receiver (Node.js/Express)

```javascript
const express = require('express');
const app = express();

app.post('/webhook', express.json(), (req, res) => {
  const { event, sessionId, payload, deliveryId } = req.body;
  
  console.log(`Webhook recebido: ${event} da sessão ${sessionId}`);
  
  // Processar evento
  switch(event) {
    case 'message.received':
      console.log(`Mensagem de ${payload.from}: ${payload.content.text}`);
      break;
    case 'session.connected':
      console.log(`Sessão ${sessionId} conectada!`);
      break;
    // ... outros eventos
  }
  
  // IMPORTANTE: Responder 200 OK rapidamente
  res.status(200).json({ success: true });
});

app.listen(8080, () => console.log('Webhook receiver rodando na porta 8080'));
```

## 📖 Documentação Completa

### 📘 Product Requirement Document
- **[PRD completo](docs/PRD-whatsapp-architecture.md)** - Visão geral, requisitos, roadmap de 12 fases

### 📗 Documentação Técnica por Etapa

1. **[Etapa 2 - Database](docs/baileys/etapa-02-database.md)** (6.500 linhas)
   - Schema completo das 3 tabelas
   - Migrations SQL versionadas
   - Repositories pattern
   - Exemplos de queries
   - Índices e otimizações

2. **[Etapa 3 - Queues](docs/baileys/etapa-03-queues.md)** (1.400 linhas)
   - BullMQ setup e configuração
   - 5 filas implementadas
   - Retry strategies e backoff
   - DLQ handling
   - Queue monitoring

3. **[Etapa 4 - Connection Manager](docs/baileys/etapa-04-connection-manager.md)** (1.400 linhas)
   - Arquitetura do ConnectionManager (738 linhas)
   - Integração com Baileys
   - Reconnection automática
   - Session recovery
   - Event handlers

4. **[Etapa 5 - API Sessions](docs/baileys/etapa-05-api-sessions.md)** (1.500 linhas)
   - 8 endpoints documentados
   - Middleware stack (auth, validation, error handling)
   - Exemplos de requisições cURL/Postman
   - Response schemas
   - Error codes

5. **[Etapa 6 - API Messages](docs/baileys/etapa-06-api-messages.md)** (1.200 linhas)
   - 9 tipos de mensagem com exemplos
   - Sistema de idempotência
   - Validation schemas (Joi)
   - Status lifecycle (queued → sent → delivered → read)
   - Troubleshooting guide

6. **[Etapa 7 - Workers & Webhooks](docs/baileys/etapa-07-workers-webhooks.md)** (1.100 linhas)
   - 4 workers detalhados
   - Sistema de webhooks com retry
   - 8 event types
   - Event tracking e auditoria
   - Exemplos de webhook receivers (Node.js, Python)

**Total**: ~14.000 linhas de documentação técnica

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT APPLICATIONS                         │
│  (Frontend, Mobile Apps, CRM, External Integrations)            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ HTTP/REST API
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS API SERVER (Port 3000)                │
│                                                                   │
│  Middleware Stack:                                               │
│  CORS → API Key Auth → Request Validation → Controller → Error  │
│                                                                   │
│  Routes:                                                         │
│  - /api/v1/sessions              (8 endpoints)                  │
│  - /api/v1/sessions/:id/messages (3 endpoints)                  │
│  - /api/v1/sessions/:id/webhook  (4 endpoints)                  │
│  - /api/v1/webhook/events        (1 endpoint)                   │
│  - /api/v1/health                (health check)                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┬─────────────┬──────────────┐
        ▼                   ▼             ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │  │  BullMQ  │  │ Connection   │
│   Database   │  │              │  │  Queues  │  │  Manager     │
│              │  │ - Cache      │  │          │  │              │
│ Tables:      │  │ - Pub/Sub    │  │ 5 Queues:│  │ Baileys      │
│ - sessions   │  │ - Session    │  │ - init   │  │ Sockets      │
│ - messages   │  │   Store      │  │ - close  │  │ (100+ active)│
│ - events     │  │              │  │ - send   │  │              │
│              │  │              │  │ - receive│  │ Auto-recover │
│ Repositories │  │              │  │ - webhook│  │ Reconnection │
└──────────────┘  └──────────────┘  └────┬─────┘  └────┬─────────┘
                                          │             │
                                          ▼             │
                                   ┌──────────────┐    │
                                   │   WORKERS    │◄───┘
                                   │   (4 types)  │
                                   │              │
                                   │ - sessionInit (concurrency: 5)   │
                                   │ - messageSend (concurrency: 5)   │
                                   │ - messageReceive (concurrency: 10)│
                                   │ - webhook (concurrency: 3)       │
                                   │                                  │
                                   │ Retry: Exponential Backoff       │
                                   │ DLQ: Failed jobs after N attempts│
                                   └──────┬──────────────────────────┘
                                          │
                         ┌────────────────┴──────────────┐
                         ▼                               ▼
                  ┌──────────────┐            ┌──────────────────┐
                  │   WhatsApp   │            │  External Apps   │
                  │   (Baileys)  │            │  (via Webhooks)  │
                  │              │            │                  │
                  │ Multi-Device │            │ Your Backend     │
                  │ Protocol     │            │ receives events  │
                  └──────────────┘            └──────────────────┘
```

---

## 🔐 Segurança

### Implementado
- ✅ **API Key Authentication** (Bearer token ou query param)
- ✅ **CORS** configurável via environment
- ✅ **Request validation** rigorosa (Joi schemas)
- ✅ **Error sanitization** (não expõe stack traces em produção)
- ✅ **Rate limiting** básico (configurável)
- ✅ **Logs estruturados** sem dados sensíveis

### Recomendações para Produção
- 🔒 **HTTPS/TLS** obrigatório
- 🔒 **Webhook signatures** (HMAC-SHA256) - Etapa 11
- 🔒 **JWT tokens** ao invés de API Key estática - Etapa 11
- 🔒 **Secrets management** (Vault, AWS Secrets Manager)
- 🔒 **Network isolation** (VPC, private subnets)
- 🔒 **Firewall rules** (apenas portas necessárias)

---

## 📊 Monitoramento & Observabilidade

### Implementado (Etapa 7)
- ✅ **Logs estruturados** (Pino/JSON)
- ✅ **Event tracking** completo (tabela `events`)
- ✅ **Health check** endpoint (`/api/v1/health`)
- ✅ **Webhook delivery tracking** (delivered/failed)
- ✅ **Queue monitoring** (BullMQ UI compatível)

### Próxima Etapa (Etapa 8 - Observabilidade)
- ⏳ **Prometheus** metrics endpoint (`/metrics`)
- ⏳ **Grafana** dashboards (mensagens/s, sessões ativas, queue size)
- ⏳ **AlertManager** (alertas via Slack/email)
- ⏳ **Distributed tracing** (Jaeger/Zipkin)
- ⏳ **Custom metrics** (latência, error rate, throughput)
- ⏳ **APM** (Application Performance Monitoring)

### Métricas Planejadas
```
# Sessions
zaphub_sessions_total{status="connected"}
zaphub_sessions_total{status="disconnected"}
zaphub_sessions_qr_generated_total

# Messages
zaphub_messages_total{direction="inbound",status="received"}
zaphub_messages_total{direction="outbound",status="sent"}
zaphub_messages_processing_duration_seconds

# Webhooks
zaphub_webhooks_delivered_total
zaphub_webhooks_failed_total
zaphub_webhooks_retry_total

# Queue
zaphub_queue_size{queue="message-send"}
zaphub_queue_processing_rate{queue="message-send"}
zaphub_queue_failed_jobs{queue="message-send"}

# System
zaphub_uptime_seconds
zaphub_http_requests_total{method="POST",route="/sessions"}
zaphub_http_request_duration_seconds{method="POST",route="/sessions"}
```

---

## � Docker & Deploy (Etapa 10)

### Docker Compose (produção)

O `docker-compose.prod.yml` no root levanta PostgreSQL, Redis, API e os workers dentro da mesma rede.

1. Copie `.env.production.example` para `.env.production` e ajuste todos os segredos/credenciais (`API_KEY`, `JWT_SECRET`, `WEBHOOK_SIGNATURE_SECRET`, banco, Redis, storage, etc.).
2. Suba os serviços:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
3. Observe logs ou pare os serviços com:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f api
   docker compose -f docker-compose.prod.yml logs -f workers
   docker compose -f docker-compose.prod.yml down
   ```
4. Para atualizações basta rodar novamente o comando `up -d --build`.

O serviço `api` expõe a porta 3000; `workers` usa o mesmo build mas executa `node src/workers/index.js`. O `Dockerfile` já define `NODE_ENV=production` e `npm start`, então as imagens são pequenas e prontas para subir em qualquer orquestrador.


---

## 🧪 Testes (Futuro - Etapa 9)

### Planejado
- **Unit tests**: Jest/Vitest (repositories, controllers, workers)
- **Integration tests**: Supertest (API endpoints)
- **E2E tests**: Mock Baileys + real database
- **Load tests**: k6/Artillery (1000 msgs/s, 100 sessions)
- **Chaos engineering**: Kill workers, disconnect network
- **Coverage**: Target 80%+

### Exemplo de teste (planejado)
```javascript
describe('POST /api/v1/sessions/:id/messages', () => {
  it('should send text message successfully', async () => {
    const response = await request(app)
      .post('/api/v1/sessions/test-session/messages')
      .set('Authorization', 'Bearer test-api-key')
      .send({
        messageId: 'msg-001',
        to: '5511999999999@s.whatsapp.net',
        type: 'text',
        text: 'Hello'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('queued');
  });
});
```

---

## ⚠️ Limitações Conhecidas

### WhatsApp/Baileys
1. **Rate Limits**: WhatsApp impõe limites não documentados (varia por conta)
2. **QR Code Expiration**: ~60 segundos (usuário deve escanear rapidamente)
3. **Session Bans**: Envio massivo pode resultar em ban temporário/permanente
4. **Media Size**: WhatsApp tem limites (16MB imagem, 64MB vídeo, etc.)
5. **Not Official API**: Baileys usa WhatsApp Web (pode quebrar com updates)
6. **Multi-device only**: Requer WhatsApp Multi-Device habilitado

### Sistema
1. **Worker failures**: Workers podem falhar (usar PM2/Kubernetes para restart)
2. **Database locks**: Alto throughput pode causar locks (use connection pooling)
3. **Redis memory**: Filas grandes podem esgotar memória (configure limits)
4. **Webhook timeouts**: Destinos lentos podem causar timeouts (10s default)

---

## 🎯 Roadmap Completo (12 Etapas)

- ✅ **Etapa 1**: Setup inicial (Node.js, Express, PostgreSQL, Redis)
- ✅ **Etapa 2**: Database schema, migrations, repositories
- ✅ **Etapa 3**: Sistema de filas (BullMQ)
- ✅ **Etapa 4**: Connection Manager (Baileys lifecycle)
- ✅ **Etapa 5**: API Sessions CRUD (8 endpoints)
- ✅ **Etapa 6**: API Messages (9 tipos, idempotência)
- ✅ **Etapa 7**: Workers & Webhooks (4 workers, retry)
- ⏳ **Etapa 8**: Observabilidade (Prometheus, Grafana, tracing)
- ⏳ **Etapa 9**: Testes (unit, integration, E2E, load, chaos)
- ⏳ **Etapa 10**: Docker & K8s (containerização, deploy)
- ⏳ **Etapa 11**: Segurança avançada (HMAC, JWT, rate limiting, Vault)
- ⏳ **Etapa 12**: UX/DX (Swagger, Postman, SDKs, admin dashboard, CLI)

**Progresso**: 58% (7/12 etapas)

---

## 💡 Dicas de Uso

### 1. Idempotência
```bash
# Enviar a mesma mensagem 2x = apenas 1 entrega
curl -X POST .../messages -d '{"messageId": "order-123", ...}'  # 201 Created
curl -X POST .../messages -d '{"messageId": "order-123", ...}'  # 200 OK (existing)
```

### 2. Formato do número WhatsApp
```javascript
// Correto (com @s.whatsapp.net)
"to": "5511999999999@s.whatsapp.net"

// Incorreto (sem sufixo)
"to": "5511999999999"  // ❌ Vai falhar
```

### 3. QR Code expirado
```bash
# Se QR expirou, delete e recrie a sessão
DELETE /api/v1/sessions/:id
POST /api/v1/sessions
```

### 4. Webhook não recebido
```bash
# 1. Teste o webhook primeiro
POST /api/v1/sessions/:id/webhook/test -d '{"url": "https://..."}'

# 2. Veja o histórico
GET /api/v1/sessions/:id/webhook/events

# 3. Retry manual se necessário
POST /api/v1/sessions/:id/webhook/retry -d '{...}'
```

### 5. Session Recovery
```javascript
// Após reiniciar o servidor, as sessões conectadas são recuperadas automaticamente
// Verifique os logs: "Recovered X active sessions"
```

---

## 📝 Licença

ISC

---

## 🤝 Contribuição

PRs são bem-vindos! Para mudanças grandes:
1. Abra uma issue descrevendo a proposta
2. Fork o projeto
3. Crie uma branch (`git checkout -b feature/amazing-feature`)
4. Commit suas mudanças (`git commit -m 'Add amazing feature'`)
5. Push para a branch (`git push origin feature/amazing-feature`)
6. Abra um Pull Request

---

## 📞 Suporte

- 📖 Documentação completa: `docs/baileys/`
- 🐛 Issues: GitHub Issues
- 💬 Discussões: GitHub Discussions

---

## 📈 Estatísticas do Projeto

- **Linhas de código**: ~7.000 linhas
- **Linhas de documentação**: ~14.000 linhas
- **Arquivos**: ~40 arquivos
- **Endpoints**: 15 endpoints REST
- **Workers**: 4 workers paralelos
- **Filas**: 5 filas BullMQ
- **Tipos de mensagem**: 9 tipos
- **Event types**: 8 eventos de webhook
- **Schemas de validação**: 15+ Joi schemas
- **Tabelas database**: 3 tabelas

---

## 🎉 Status Atual

**ZapHub está 100% funcional para MVP!**

✅ Gerenciamento completo de sessões WhatsApp  
✅ Envio de 9 tipos de mensagem  
✅ Processamento assíncrono robusto (filas + workers)  
✅ Sistema de webhooks com retry  
✅ Idempotência e tolerância a falhas  
✅ Documentação extensiva (14.000+ linhas)  
✅ Arquitetura escalável  

**Pronto para:**
- ✅ Desenvolvimento local
- ✅ Testes de integração
- ✅ MVP em produção (com monitoramento externo)

**Faltam para produção enterprise:**
- ⏳ Observabilidade (Prometheus/Grafana)
- ⏳ Testes automatizados
- ⏳ Docker/Kubernetes deployment
- ⏳ Segurança avançada (HMAC, rate limiting)
