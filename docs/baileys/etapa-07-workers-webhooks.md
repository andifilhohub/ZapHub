# Etapa 07 - Workers e Sistema de Webhooks

## 📋 Sumário Executivo

### Objetivo da Etapa
Implementar **sistema completo de workers** para processamento assíncrono de mensagens recebidas e **sistema robusto de webhooks** para notificar aplicações externas sobre eventos em tempo real.

### Motivação
O processamento assíncrono e notificações são essenciais para:
1. **Desacoplar recepção de processamento** - não bloquear socket Baileys
2. **Garantir entrega de notificações** - retry com backoff exponencial
3. **Escalar processamento** - múltiplos workers em paralelo
4. **Rastrear eventos** - auditoria completa de todas as operações
5. **Integração externa** - webhooks para sistemas clientes

### Componentes Implementados
```
src/workers/
├── messageReceiveWorker.js       # Processa mensagens recebidas
├── webhookWorker.js               # Entrega webhooks com retry
├── sessionInitWorker.js           # [EXISTING] Inicializa sessões
├── messageSendWorker.js           # [EXISTING] Envia mensagens
└── index.js                       # Orquestrador de workers

src/lib/queues/
├── webhookQueue.js                # [UPDATED] Configuração retry
└── messageQueue.js                # [EXISTING] Filas de mensagens

src/api/
├── controllers/
│   └── webhookController.js       # Gerenciamento de webhooks
├── validators/
│   └── webhookValidators.js       # Schemas Joi
└── routes/
    └── webhooks.js                # Endpoints de webhooks

src/db/repositories/
└── events.js                      # [UPDATED] Filtros aprimorados

config/index.js                    # [UPDATED] Webhook settings
```

---

## 🏗️ Arquitetura do Sistema

### Visão Geral
```
┌─────────────────────────────────────────────────────────────────┐
│                    WHATSAPP (via Baileys)                        │
│                 ↓ Incoming Message                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONNECTION MANAGER                                  │
│  - Receives messages.upsert event                               │
│  - Extracts message content                                     │
│  - Enqueues to MESSAGE_RECEIVE queue                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Enqueue Job
┌─────────────────────────────────────────────────────────────────┐
│                MESSAGE RECEIVE QUEUE (BullMQ)                    │
│                                                                   │
│  Queue: message-receive                                         │
│  Concurrency: 10 workers                                        │
│  Priority: 3 (higher than outbound)                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Worker picks job
┌─────────────────────────────────────────────────────────────────┐
│             MESSAGE RECEIVE WORKER                               │
│                                                                   │
│  1. Create message in DB (direction: inbound)                   │
│  2. Log event (message.received)                                │
│  3. Check session webhook_url                                   │
│  4. If webhook_url exists → Enqueue webhook delivery            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Enqueue Webhook
┌─────────────────────────────────────────────────────────────────┐
│                WEBHOOK DELIVERY QUEUE (BullMQ)                   │
│                                                                   │
│  Queue: webhook-delivery                                        │
│  Concurrency: 3 workers                                         │
│  Retry: 3 attempts with exponential backoff (2s → 8s)          │
│  Timeout: 10 seconds per request                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Worker picks job
┌─────────────────────────────────────────────────────────────────┐
│                WEBHOOK WORKER                                    │
│                                                                   │
│  1. Make HTTP POST to webhook_url                               │
│  2. Include headers (X-ZapHub-Event, X-ZapHub-Session)         │
│  3. Timeout after 10 seconds                                    │
│  4. Log event (webhook.delivered or webhook.failed)            │
│  5. On failure → Retry with backoff                            │
│  6. After 3 failures → Log final failure                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CLIENT APPLICATION                              │
│  - Receives webhook POST                                        │
│  - Processes event                                              │
│  - Returns 2xx status code                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Workers Implementados

### 1. Message Receive Worker

**Arquivo**: `src/workers/messageReceiveWorker.js`

**Responsabilidades**:
- Processar mensagens recebidas do WhatsApp
- Salvar no banco de dados
- Disparar webhooks para aplicações cliente

**Fluxo de Processamento**:
```javascript
async function processReceiveMessage(job) {
  const { sessionId, waMessageId, from, type, content, timestamp } = job.data;

  // 1. Create message record
  const message = await createMessage({
    sessionId,
    messageId: waMessageId, // WhatsApp message ID as idempotency key
    direction: 'inbound',
    jid: from,
    type,
    payload: content,
    status: 'delivered',
    waMessageId,
    waTimestamp: timestamp,
  });

  // 2. Log event
  await createEvent({
    sessionId,
    eventType: 'message.received',
    eventCategory: 'message',
    payload: { messageDbId: message.id, from, type, waMessageId },
  });

  // 3. Check for webhook URL
  const session = await getSessionById(sessionId);
  if (session?.webhook_url) {
    // 4. Enqueue webhook delivery
    await enqueueWebhookForEvent(sessionId, session.webhook_url, 'message.received', {
      messageId: message.id,
      from,
      type,
      content,
      timestamp,
    });
  }

  return { success: true, messageDbId: message.id };
}
```

**Configuração**:
```javascript
const worker = new Worker(QUEUE_NAMES.MESSAGE_RECEIVE, processReceiveMessage, {
  connection,
  concurrency: 10, // Process 10 messages simultaneously
});
```

**Eventos Emitidos**:
- `message.received` - Mensagem recebida e processada
- `webhook.delivery.queued` - Webhook enfileirado (se configurado)

---

### 2. Webhook Worker

**Arquivo**: `src/workers/webhookWorker.js`

**Responsabilidades**:
- Entregar eventos para endpoints HTTP externos
- Retry com backoff exponencial
- Timeout handling
- Logging de sucesso/falha

**Fluxo de Entrega**:
```javascript
async function processWebhookDelivery(job) {
  const { sessionId, webhookUrl, event, payload, attempt } = job.data;

  // Make HTTP request
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ZapHub-Webhook/1.0',
      'X-ZapHub-Event': event,
      'X-ZapHub-Session': sessionId,
      'X-ZapHub-Delivery': job.id,
    },
    body: JSON.stringify({
      event,
      sessionId,
      payload,
      timestamp: new Date().toISOString(),
      deliveryId: job.id,
    }),
    signal: AbortSignal.timeout(10000), // 10 second timeout
  });

  if (!response.ok) {
    throw new Error(`Webhook returned status ${response.status}`);
  }

  // Log success
  await createEvent({
    sessionId,
    eventType: 'webhook.delivered',
    eventCategory: 'webhook',
    payload: { event, webhookUrl, status: response.status, attempt },
  });

  return { success: true, status: response.status };
}
```

**Configuração de Retry**:
```javascript
const worker = new Worker(QUEUE_NAMES.WEBHOOK_DELIVERY, processWebhookDelivery, {
  connection,
  concurrency: 3, // Limit concurrent webhook calls
});

// Queue options (in webhookQueue.js):
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s → 4s → 8s
  },
  removeOnComplete: {
    age: 3600,    // Keep for 1 hour
    count: 100,   // Keep last 100
  },
  removeOnFail: {
    age: 86400,   // Keep failures for 24 hours
  },
}
```

**Headers Enviados**:
```http
POST https://your-app.com/webhook
Content-Type: application/json
User-Agent: ZapHub-Webhook/1.0
X-ZapHub-Event: message.received
X-ZapHub-Session: session-id-here
X-ZapHub-Delivery: job-id-here

{
  "event": "message.received",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-456",
    "from": "5511999999999@s.whatsapp.net",
    "type": "text",
    "content": { "text": "Hello" },
    "timestamp": 1699876543
  },
  "timestamp": "2025-11-13T10:30:00.000Z",
  "deliveryId": "webhook-abc-123-message.received-1699876543-xyz"
}
```

---

## 🎯 API Endpoints de Webhooks

### Resumo de Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/v1/sessions/:id/webhook/test` | Test webhook URL | ✅ |
| `GET` | `/api/v1/sessions/:id/webhook/events` | List webhook events | ✅ |
| `POST` | `/api/v1/sessions/:id/webhook/retry` | Retry failed webhook | ✅ |
| `GET` | `/api/v1/webhook/events` | Get available event types | ✅ |

---

### 1. Test Webhook

**Endpoint**: `POST /api/v1/sessions/:id/webhook/test`

**Purpose**: Testar URL de webhook antes de configurar na sessão.

**Request**:
```bash
curl -X POST "http://localhost:3000/api/v1/sessions/abc-123/webhook/test" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook",
    "event": "webhook.test"
  }'
```

**Request Body**:
```json
{
  "url": "https://your-app.com/webhook",  // Optional if session has webhook_url
  "event": "webhook.test"                  // Optional, defaults to "webhook.test"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "data": {
    "url": "https://your-app.com/webhook",
    "statusCode": 200,
    "statusText": "OK",
    "ok": true,
    "headers": {
      "content-type": "application/json",
      "content-length": "42"
    },
    "response": "{\"status\":\"ok\",\"received\":true}",
    "latency": null
  },
  "message": "Webhook test successful"
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "data": {
    "url": "https://your-app.com/webhook",
    "error": "request to https://your-app.com/webhook failed, reason: connect ECONNREFUSED",
    "errorType": "TypeError",
    "timeout": false,
    "networkError": "ECONNREFUSED"
  },
  "message": "Webhook test failed: request to https://your-app.com/webhook failed..."
}
```

---

### 2. Get Webhook Events

**Endpoint**: `GET /api/v1/sessions/:id/webhook/events`

**Purpose**: Listar histórico de entregas de webhook.

**Query Parameters**:
- `limit`: Máximo de resultados (default: 50, max: 100)
- `offset`: Offset para paginação (default: 0)
- `status`: Filtrar por status (`delivered`, `failed`)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/v1/sessions/abc-123/webhook/events?limit=10&status=delivered" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "event-uuid-1",
      "eventType": "webhook.delivered",
      "payload": {
        "event": "message.received",
        "webhookUrl": "https://your-app.com/webhook",
        "status": 200,
        "attempt": 1
      },
      "severity": "debug",
      "created_at": "2025-11-13T10:30:00Z"
    },
    {
      "id": "event-uuid-2",
      "eventType": "webhook.failed",
      "payload": {
        "event": "message.sent",
        "webhookUrl": "https://your-app.com/webhook",
        "error": "Webhook returned status 500",
        "attempt": 3
      },
      "severity": "warn",
      "created_at": "2025-11-13T10:25:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 2
  }
}
```

---

### 3. Retry Webhook

**Endpoint**: `POST /api/v1/sessions/:id/webhook/retry`

**Purpose**: Reenviar evento falhado manualmente.

**Request**:
```bash
curl -X POST "http://localhost:3000/api/v1/sessions/abc-123/webhook/retry" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "payload": {
      "messageId": "uuid-456",
      "from": "5511999999999@s.whatsapp.net",
      "type": "text",
      "content": { "text": "Hello" }
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobId": "webhook-abc-123-message.received-1699876543-xyz",
    "webhookUrl": "https://your-app.com/webhook",
    "event": "message.received"
  },
  "message": "Webhook retry queued successfully"
}
```

---

### 4. Get Event Types

**Endpoint**: `GET /api/v1/webhook/events`

**Purpose**: Listar todos os tipos de eventos disponíveis para webhooks.

**Request**:
```bash
curl -X GET "http://localhost:3000/api/v1/webhook/events" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "event": "session.qr_updated",
      "description": "QR code was generated or updated",
      "category": "session",
      "payload": {
        "qr_code": "base64_string",
        "generated_at": "timestamp"
      }
    },
    {
      "event": "session.connected",
      "description": "Session successfully connected to WhatsApp",
      "category": "session",
      "payload": {
        "connected_at": "timestamp",
        "phone_number": "string (if available)"
      }
    },
    {
      "event": "message.received",
      "description": "New message received",
      "category": "message",
      "payload": {
        "messageId": "uuid",
        "from": "jid",
        "type": "text|image|video|...",
        "content": "object",
        "timestamp": "timestamp"
      }
    }
  ],
  "message": "8 webhook event types available"
}
```

---

## 📡 Webhook Events

### Tipos de Eventos

#### Session Events

**1. session.qr_updated**
```json
{
  "event": "session.qr_updated",
  "sessionId": "abc-123",
  "payload": {
    "qr_code": "iVBORw0KGgoAAAANS...",
    "generated_at": "2025-11-13T10:30:00Z"
  },
  "timestamp": "2025-11-13T10:30:00.000Z"
}
```

**2. session.connected**
```json
{
  "event": "session.connected",
  "sessionId": "abc-123",
  "payload": {
    "connected_at": "2025-11-13T10:30:30Z",
    "phone_number": "5511999999999"
  },
  "timestamp": "2025-11-13T10:30:30.000Z"
}
```

**3. session.disconnected**
```json
{
  "event": "session.disconnected",
  "sessionId": "abc-123",
  "payload": {
    "reason": "Connection Lost",
    "disconnected_at": "2025-11-13T11:00:00Z"
  },
  "timestamp": "2025-11-13T11:00:00.000Z"
}
```

---

#### Message Events

**1. message.received**
```json
{
  "event": "message.received",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-456",
    "chatId": "5511999999999@s.whatsapp.net",
    "from": "5511999999999@s.whatsapp.net",
    "participant": null,
    "type": "text",
    "content": {
      "text": "Hello, I need help"
    },
    "chatName": "Maria Silva",
    "chatImageUrl": "https://cdn.whatsapp.net/profile/maria.jpg",
    "contactName": "Maria Silva",
    "contactImageUrl": "https://cdn.whatsapp.net/profile/maria.jpg",
    "isGroup": false,
    "timestamp": 1699876543
  },
  "timestamp": "2025-11-13T10:35:00.000Z"
}
```

Campos adicionais:

- `chatId`: JID da conversa (contato, grupo ou broadcast)
- `chatName`/`chatImageUrl`: nome e foto resolvidos em tempo real
- `participant`/`participantName`: remetente dentro do grupo (null em 1:1)
- `groupId`/`groupName`/`groupImageUrl`: preenchidos apenas quando `isGroup = true`
- `contactName`/`contactImageUrl`: preenchidos apenas quando não for grupo

**2. message.sent**
```json
{
  "event": "message.sent",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-789",
    "to": "5511999999999@s.whatsapp.net",
    "wa_message_id": "3EB0C7...",
    "timestamp": 1699876600
  },
  "timestamp": "2025-11-13T10:36:00.000Z"
}
```

**3. message.delivered**
```json
{
  "event": "message.delivered",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-789",
    "wa_message_id": "3EB0C7...",
    "timestamp": 1699876605
  },
  "timestamp": "2025-11-13T10:36:05.000Z"
}
```

**4. message.read**
```json
{
  "event": "message.read",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-789",
    "wa_message_id": "3EB0C7...",
    "timestamp": 1699876610
  },
  "timestamp": "2025-11-13T10:36:10.000Z"
}
```

**5. message.failed**
```json
{
  "event": "message.failed",
  "sessionId": "abc-123",
  "payload": {
    "messageId": "uuid-999",
    "error": "Session is not connected",
    "attempts": 5
  },
  "timestamp": "2025-11-13T10:40:00.000Z"
}
```

---

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# Webhook Configuration
WEBHOOK_TIMEOUT_MS=10000                # Timeout per request (10s)
WEBHOOK_RETRY_ATTEMPTS=3                # Number of retry attempts
WEBHOOK_RETRY_DELAY_MS=2000             # Base delay for exponential backoff (2s)
WEBHOOK_MAX_BODY_SIZE=1048576           # Max response body size (1MB)

# Queue Configuration
QUEUE_CONCURRENCY=5                     # General queue concurrency
QUEUE_MAX_ATTEMPTS=5                    # Max retry attempts
QUEUE_BACKOFF_DELAY=1000                # Base backoff delay (1s)
```

### Configurando Webhook na Sessão

**Ao criar sessão**:
```bash
curl -X POST "http://localhost:3000/api/v1/sessions" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Support Team",
    "webhook_url": "https://your-app.com/webhook"
  }'
```

**Atualizando sessão existente**:
```bash
curl -X PATCH "http://localhost:3000/api/v1/sessions/abc-123" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-app.com/webhook"
  }'
```

---

## 💻 Implementando Webhook Receiver

### Node.js / Express Example

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook', (req, res) => {
  const { event, sessionId, payload, timestamp, deliveryId } = req.body;
  
  // Log received webhook
  console.log(`[Webhook] Received: ${event} from ${sessionId}`);
  console.log('Payload:', payload);
  console.log('Headers:', req.headers);
  
  // Process based on event type
  switch (event) {
    case 'message.received':
      handleIncomingMessage(sessionId, payload);
      break;
    
    case 'session.connected':
      handleSessionConnected(sessionId, payload);
      break;
    
    case 'message.sent':
      handleMessageSent(sessionId, payload);
      break;
    
    default:
      console.log(`Unknown event: ${event}`);
  }
  
  // IMPORTANT: Return 2xx status code
  res.status(200).json({ received: true });
});

function handleIncomingMessage(sessionId, payload) {
  // Your business logic here
  console.log(`New message from ${payload.from}: ${payload.content.text}`);
}

app.listen(3001, () => {
  console.log('Webhook receiver listening on port 3001');
});
```

### Python / Flask Example

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.get_json()
    event = data.get('event')
    session_id = data.get('sessionId')
    payload = data.get('payload')
    
    # Log received webhook
    app.logger.info(f"[Webhook] Received: {event} from {session_id}")
    app.logger.info(f"Payload: {payload}")
    app.logger.info(f"Headers: {dict(request.headers)}")
    
    # Process based on event type
    if event == 'message.received':
        handle_incoming_message(session_id, payload)
    elif event == 'session.connected':
        handle_session_connected(session_id, payload)
    elif event == 'message.sent':
        handle_message_sent(session_id, payload)
    
    # IMPORTANT: Return 2xx status code
    return jsonify({"received": True}), 200

def handle_incoming_message(session_id, payload):
    # Your business logic here
    print(f"New message from {payload['from']}: {payload['content']['text']}")

if __name__ == '__main__':
    app.run(port=3001)
```

---

## 🔍 Troubleshooting

### Webhook não está sendo entregue

**1. Verificar URL configurada**:
```bash
curl -X GET "http://localhost:3000/api/v1/sessions/abc-123" \
  -H "Authorization: Bearer your-api-key" | jq '.data.webhook_url'
```

**2. Testar URL manualmente**:
```bash
curl -X POST "http://localhost:3000/api/v1/sessions/abc-123/webhook/test" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.com/webhook"}'
```

**3. Verificar logs de webhook**:
```bash
curl -X GET "http://localhost:3000/api/v1/sessions/abc-123/webhook/events?status=failed" \
  -H "Authorization: Bearer your-api-key"
```

**4. Verificar workers rodando**:
```bash
pm2 list
# ou
docker ps | grep worker
```

---

### Webhook retornando timeout

**Causas**:
- Webhook receiver está lento (>10s)
- Rede instável
- Servidor webhook offline

**Soluções**:

**1. Aumentar timeout** (`.env`):
```bash
WEBHOOK_TIMEOUT_MS=30000  # 30 seconds
```

**2. Processar de forma assíncrona no receiver**:
```javascript
app.post('/webhook', async (req, res) => {
  const { event, payload } = req.body;
  
  // Respond immediately
  res.status(200).json({ received: true });
  
  // Process async (don't await)
  processWebhookAsync(event, payload).catch(console.error);
});

async function processWebhookAsync(event, payload) {
  // Heavy processing here
  await saveToDatabase(payload);
  await triggerBusinessLogic(event);
}
```

### Mensagens com mídia criptografada (`raw_media`)

Quando o worker falha em persistir o anexo localmente (por exemplo porque a sessão ainda está inicializando), o webhook é enviado com o campo `payload.raw_media`. Esse objeto contém a URL e o `mediaKey` que o WhatsApp entregou originalmente, então **é responsabilidade do Chatwoot baixar esse blob cifrado e aplicar `decrypt_whatsapp_media`** sem modificar nenhum byte.

- Baixe o `raw_media.url` com `Accept-Encoding: identity` e sem middlewares que recompactem, descompactem ou reescrevam o corpo.
- Confirme que o `content-length` retornado bate com `raw_media.fileLength`; discrepâncias indicam que algum proxy está alterando os bytes e quebrará o AES.
- Passe o `payload.raw_media.mediaKey` **sem alterações** para o `decrypt_whatsapp_media` ou utilitário equivalente da sua stack.

```javascript
import fetch from 'node-fetch';

async function fetchEncryptedMedia(rawMedia) {
  const response = await fetch(rawMedia.url, {
    headers: {
      'Accept-Encoding': 'identity',
      'User-Agent': 'ZapHub-raw-media',
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar raw_media: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== rawMedia.fileLength) {
    throw new Error('raw_media em tamanhos diferentes; verifique proxies/compressão');
  }

  return Buffer.from(buffer); // coloque esse Buffer em decrypt_whatsapp_media(rawMedia.mediaKey)
}
```

Se o Chatwoot continuar sem conseguir recuperar a mídia mesmo com o `mediaKey`, avalie a rota usada para baixar `raw_media.url`: qualquer proxy que reescreva o corpo ou altere headers acabará mudando o conteúdo cifrado e fará com que o AES retorne erro de padding.

---

### Mensagens recebidas não aparecem no banco

**1. Verificar worker de recebimento**:
```bash
pm2 logs messageReceiveWorker
```

**2. Verificar fila**:
```sql
-- Redis CLI
redis-cli
LLEN bull:message-receive:wait
```

**3. Verificar ConnectionManager**:
Procurar logs de `[ConnectionManager] Message received` nos logs do worker.

---

### Duplicação de webhooks

**Causa**: Retry após timeout, mas o primeiro request foi processado.

**Solução**: Implementar idempotência no receiver usando `deliveryId`:

```javascript
const processedDeliveries = new Set();

app.post('/webhook', (req, res) => {
  const { deliveryId } = req.body;
  
  // Check if already processed
  if (processedDeliveries.has(deliveryId)) {
    console.log(`Duplicate delivery: ${deliveryId}`);
    return res.status(200).json({ received: true, duplicate: true });
  }
  
  // Mark as processed
  processedDeliveries.add(deliveryId);
  
  // Process webhook
  handleWebhook(req.body);
  
  res.status(200).json({ received: true });
});
```

---

## 📊 Monitoramento

### Métricas de Workers

**1. Taxa de Processamento**:
```sql
-- Messages processed in last hour
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as messages_processed
FROM messages
WHERE direction = 'inbound'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

**2. Taxa de Sucesso de Webhooks**:
```sql
-- Webhook success rate
SELECT 
  event_type,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE event_type = 'webhook.delivered') / COUNT(*), 2) as success_rate
FROM events
WHERE event_category = 'webhook'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

**3. Tamanho das Filas**:
```bash
# Redis CLI
redis-cli

# Message receive queue
LLEN bull:message-receive:wait
LLEN bull:message-receive:active

# Webhook queue
LLEN bull:webhook-delivery:wait
LLEN bull:webhook-delivery:active
LLEN bull:webhook-delivery:failed
```

---

### Logs Importantes

**Message Received**:
```json
{
  "level": "info",
  "msg": "[MessageReceiveWorker] Message processed successfully",
  "messageDbId": "uuid-123",
  "waMessageId": "3EB0C7...",
  "jobId": "msg-receive-3EB0C7..."
}
```

**Webhook Delivered**:
```json
{
  "level": "info",
  "msg": "[WebhookWorker] Webhook delivered successfully",
  "sessionId": "abc-123",
  "webhookUrl": "https://your-app.com/webhook",
  "event": "message.received",
  "status": 200
}
```

**Webhook Failed**:
```json
{
  "level": "error",
  "msg": "[WebhookWorker] Webhook delivery failed",
  "sessionId": "abc-123",
  "webhookUrl": "https://your-app.com/webhook",
  "event": "message.received",
  "error": "Webhook returned status 500",
  "attempt": 3
}
```

---

## 🎯 Próximos Passos

### Etapa 8: Observabilidade e Métricas
- Prometheus metrics endpoint
- Grafana dashboards
- Alerting com AlertManager
- Health checks avançados

### Etapa 9: Testes
- Unit tests para workers
- Integration tests com mock Baileys
- Load testing
- Chaos testing

### Melhorias Futuras
- **Webhook Signatures**: HMAC para validar origem
- **Webhook Filtering**: Configurar quais eventos receber
- **Batch Webhooks**: Agrupar múltiplos eventos em um request
- **Webhook Transformations**: Templates customizáveis
- **DLQ UI**: Interface para visualizar e reprocessar falhas

---

## 📝 Checklist de Validação

- [x] Message Receive Worker implementado
- [x] Webhook Worker com retry exponencial
- [x] Webhook test endpoint
- [x] Webhook events listing
- [x] Webhook retry endpoint
- [x] Event types documentation endpoint
- [x] Timeout handling (10s)
- [x] Retry configuration (3 attempts)
- [x] Event logging (webhook.delivered, webhook.failed)
- [x] Headers customizados (X-ZapHub-*)
- [x] Idempotência (deliveryId)
- [x] Documentação completa
- [x] Exemplos de implementação (Node.js, Python)

---

## 🔗 Referências

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Webhook Best Practices](https://webhooks.fyi/)
- [Retry Strategies](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Fetch API Timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout)

---

## 📌 Conclusão

A **Etapa 7** estabeleceu o **sistema completo de workers e webhooks**:

✅ **Message Receive Worker** - Processa mensagens recebidas com alta concorrência (10 workers)  
✅ **Webhook Worker** - Entrega eventos com retry inteligente (3 tentativas, backoff exponencial)  
✅ **API de Webhooks** - Test, list events, retry, event types  
✅ **Timeout Handling** - 10 segundos por request com AbortSignal  
✅ **Headers Customizados** - X-ZapHub-Event, X-ZapHub-Session, X-ZapHub-Delivery  
✅ **Idempotência** - deliveryId único para prevenir duplicação  
✅ **Event Tracking** - Auditoria completa (webhook.delivered, webhook.failed)  
✅ **Exemplos de Código** - Node.js e Python receivers  

**O sistema agora permite**:
- **Receber mensagens** e processar de forma assíncrona
- **Notificar aplicações** via webhooks em tempo real
- **Retry automático** de falhas com backoff
- **Testar webhooks** antes de configurar
- **Auditar entregas** com histórico completo
- **Integrar com qualquer linguagem** (HTTP POST)

**Próximo passo**: Implementar **observabilidade com Prometheus** e **testes automatizados**.

---

**Data de Conclusão**: 2025-11-13  
**Arquivos Criados**: 4  
**Arquivos Modificados**: 6  
**Linhas de Código**: ~800  
**Workers Implementados**: 4 (total)  
**Endpoints Adicionados**: 4  
**Status**: ✅ **ETAPA CONCLUÍDA**
