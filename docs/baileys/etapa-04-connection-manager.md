# Etapa 04 - Connection Manager

## 📋 Sumário Executivo

### Objetivo da Etapa
Implementar o **ConnectionManager**, componente central responsável por gerenciar o ciclo de vida completo de sockets Baileys WhatsApp para múltiplas sessões simultâneas.

### Motivação
O ConnectionManager é o **cérebro** do sistema de conexões WhatsApp. Ele:
1. **Isola** cada sessão em seu próprio socket Baileys
2. **Gerencia** autenticação (QR code, credenciais)
3. **Reconecta** automaticamente em caso de falhas
4. **Encaminha** mensagens recebidas para processamento
5. **Integra** com workers de fila e banco de dados
6. **Monitora** estado de conexão de todas as sessões

### Componentes Implementados
```
src/core/
├── ConnectionManager.js    # Classe principal de gerenciamento
├── sessionRecovery.js      # Recuperação de sessões ativas
└── index.js                # Barrel export

Integrações:
├── src/workers/sessionInitWorker.js  (atualizado)
├── src/workers/messageSendWorker.js  (atualizado)
└── src/workers/index.js              (atualizado com recovery)
```

---

## 🏗️ Arquitetura do Connection Manager

### Visão Geral do Fluxo
```
┌──────────────────────────────────────────────────────────────────┐
│                     CONNECTION MANAGER                            │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │         SOCKETS MAP (sessionId -> Socket Instance)          │ │
│  │                                                               │ │
│  │  session-001 ──► BaileysSocket (connected)                  │ │
│  │  session-002 ──► BaileysSocket (qr_pending)                 │ │
│  │  session-003 ──► BaileysSocket (reconnecting)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ startSession() │  │ stopSession()   │  │ sendMessage()    │  │
│  │ - Create socket│  │ - Logout        │  │ - Get socket     │  │
│  │ - Setup events │  │ - Clear timeout │  │ - Validate state │  │
│  │ - Update DB    │  │ - Update DB     │  │ - Call Baileys   │  │
│  └────────────────┘  └─────────────────┘  └──────────────────┘  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   EVENT HANDLERS                            │  │
│  │                                                              │  │
│  │  connection.update ──► handleConnectionUpdate()            │  │
│  │     ├─ QR generated ──► Update DB + Trigger webhook        │  │
│  │     ├─ Connected    ──► Update DB + Reset retries          │  │
│  │     └─ Closed       ──► Reconnect logic or logout          │  │
│  │                                                              │  │
│  │  messages.upsert   ──► handleMessagesUpsert()              │  │
│  │     └─ Enqueue to message:receive queue                    │  │
│  │                                                              │  │
│  │  creds.update      ──► saveCreds() (auto by Baileys)       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │                    │                     │
         ▼                    ▼                     ▼
   ┌──────────┐        ┌──────────┐        ┌──────────────┐
   │PostgreSQL│        │  Redis   │        │ auth_data/   │
   │(sessions)│        │ (queues) │        │ <sessionId>/ │
   └──────────┘        └──────────┘        └──────────────┘
```

### Ciclo de Vida de uma Sessão

```
┌──────────────┐
│   CREATED    │  (registro no DB, status=initializing)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ INITIALIZING │  ConnectionManager.startSession()
└──────┬───────┘  - Carrega auth_data/<sessionId>
       │          - Cria socket Baileys
       │          - Setup event handlers
       ▼
┌──────────────┐
│ QR_PENDING   │  QR code gerado (se não autenticado)
└──────┬───────┘  - Webhook enviado com QR
       │          - Cliente escaneia QR
       ▼
┌──────────────┐
│  CONNECTED   │  Conexão estabelecida
└──────┬───────┘  - Ready para enviar/receber mensagens
       │          - Retry count = 0
       │
       ├──────────► [Mensagens enviadas/recebidas]
       │
       │  (Falha de rede, WhatsApp desconecta)
       ▼
┌──────────────┐
│ RECONNECTING │  Reconexão automática
└──────┬───────┘  - Exponential backoff (5s, 10s, 20s, 40s, 80s)
       │          - Max 5 tentativas
       │
       ├─► SUCCESS ──► CONNECTED
       │
       └─► MAX RETRIES ──► FAILED (requer intervenção manual)

   (Logout explícito)
       │
       ▼
┌──────────────┐
│  LOGGED_OUT  │  Credenciais invalidadas
└──────────────┘  - auth_data/ removido
                  - Requer nova autenticação (novo QR)
```

---

## 📁 Estrutura de Arquivos

### 1. `src/core/ConnectionManager.js`

Classe principal com **700+ linhas** de código robusto.

#### Propriedades de Instância

```javascript
class ConnectionManager {
  constructor() {
    this.sockets = new Map();           // sessionId -> socket
    this.retryCounts = new Map();       // sessionId -> retry count
    this.reconnectTimeouts = new Map(); // sessionId -> timeout
    this.maxRetries = 5;
    this.retryBaseDelay = 5000; // 5s
  }
}
```

#### Métodos Públicos

##### **startSession(sessionId, options)**
Inicia uma nova sessão WhatsApp.

**Fluxo**:
1. Verifica se sessão já existe (`this.sockets.has(sessionId)`)
2. Busca sessão no PostgreSQL para validar
3. Atualiza status para `initializing`
4. Cria diretório `auth_data/<sessionId>` se não existir
5. Carrega credenciais via `useMultiFileAuthState()`
6. Obtém versão mais recente do Baileys
7. Cria socket com `makeWASocket()`
8. Registra socket no Map
9. Configura event handlers
10. Retorna instância do socket

**Exemplo de uso**:
```javascript
import { getConnectionManager } from './src/core/ConnectionManager.js';

const manager = getConnectionManager();
const socket = await manager.startSession('session-uuid-123', {
  markOnlineOnConnect: true,
});
```

**Erros possíveis**:
- `Session ${sessionId} not found in database`
- Erros de I/O ao criar diretório auth_data
- Falha ao conectar socket Baileys

---

##### **stopSession(sessionId, reason)**
Encerra uma sessão graciosamente.

**Fluxo**:
1. Cancela timeout de reconexão (se existir)
2. Chama `socket.logout()` para desautenticar
3. Remove socket do Map
4. Reseta retry count
5. Atualiza status para `disconnected` no DB
6. Registra evento `session.stopped`

**Exemplo de uso**:
```javascript
await manager.stopSession('session-uuid-123', 'manual_disconnect');
```

---

##### **sendMessage(sessionId, jid, content)**
Envia mensagem via socket Baileys.

**Parâmetros**:
- `sessionId`: UUID da sessão
- `jid`: WhatsApp JID (ex: `5511999998888@s.whatsapp.net`)
- `content`: Objeto de conteúdo Baileys (ex: `{ text: 'Hello!' }`)

**Validações**:
- Sessão deve existir
- Sessão deve estar conectada (`socket.user` definido)

**Retorno**:
```javascript
{
  key: { id: 'wamid.xyz', remoteJid: '...', fromMe: true },
  messageTimestamp: 1735689123,
  message: { ... }
}
```

**Exemplo de uso**:
```javascript
const result = await manager.sendMessage(
  'session-uuid-123',
  '5511999998888@s.whatsapp.net',
  { text: 'Olá via ConnectionManager!' }
);

console.log('Message ID:', result.key.id);
```

---

##### **getSocket(sessionId)**
Retorna a instância do socket (ou `undefined` se não existir).

```javascript
const socket = manager.getSocket('session-uuid-123');
if (socket) {
  console.log('Socket exists for session');
}
```

---

##### **isConnected(sessionId)**
Verifica se sessão está autenticada e conectada.

```javascript
if (manager.isConnected('session-uuid-123')) {
  console.log('Session is ready to send messages');
}
```

**Implementação**:
```javascript
isConnected(sessionId) {
  const socket = this.sockets.get(sessionId);
  return socket?.user ? true : false; // `user` é definido quando autenticado
}
```

---

##### **getStatus(sessionId)**
Retorna status atual da sessão.

**Possíveis retornos**:
- `'disconnected'`: Socket não existe
- `'connecting'`: Socket existe mas `user` não definido
- `'connected'`: Socket autenticado (`user` presente)

---

##### **getActiveSessions()**
Retorna array de `sessionId` de todas as sessões ativas.

```javascript
const active = manager.getActiveSessions();
console.log(`Active sessions: ${active.length}`);
// ['session-001', 'session-002', ...]
```

---

##### **shutdown()**
Encerra todas as sessões (usado no graceful shutdown do worker).

```javascript
await manager.shutdown();
```

---

#### Métodos Privados (Internos)

##### **setupEventHandlers(sessionId, socket, saveCreds)**
Configura listeners de eventos Baileys.

**Eventos configurados**:
- `connection.update`: Mudanças de conexão
- `creds.update`: Atualização de credenciais (auto-save)
- `messages.upsert`: Mensagens recebidas
- `messages.update`: Status de mensagens

---

##### **handleConnectionUpdate(sessionId, socket, update)**
Processa updates de conexão.

**Casos tratados**:

**1. QR Code Gerado (`update.qr`)**
```javascript
if (qr) {
  // Atualiza DB com QR e timestamp
  await updateSession(sessionId, {
    status: 'qr_pending',
    qr_code: qr,
    last_qr_at: new Date(),
  });

  // Dispara webhook (se configurado)
  const session = await getSessionById(sessionId);
  if (session?.webhook_url) {
    await enqueueWebhookForEvent(
      sessionId,
      session.webhook_url,
      'session.qr_generated',
      { qr, timestamp: new Date().toISOString() }
    );
  }
}
```

**2. Conexão Aberta (`connection === 'open'`)**
```javascript
// Reset retry count
this.retryCounts.set(sessionId, 0);

// Atualiza DB
await updateSession(sessionId, {
  status: 'connected',
  connected_at: new Date(),
  last_seen: new Date(),
  error_message: null,
  retry_count: 0,
});

// Dispara evento + webhook
await createEvent({ ... });
```

**3. Conexão Fechada (`connection === 'close'`)**
```javascript
const statusCode = lastDisconnect?.error?.output?.statusCode;
const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

if (shouldReconnect) {
  // Tenta reconectar automaticamente
  await this.handleReconnect(sessionId, reason);
} else {
  // Logged out - limpa auth_data
  await updateSession(sessionId, { status: 'logged_out' });
  await this.clearAuthData(sessionId);
}
```

---

##### **handleReconnect(sessionId, reason)**
Implementa reconexão com **exponential backoff**.

**Lógica**:
```javascript
const retryCount = this.retryCounts.get(sessionId) || 0;

if (retryCount >= this.maxRetries) {
  // Desiste após 5 tentativas
  await updateSession(sessionId, {
    status: 'failed',
    error_message: `Max retries (${this.maxRetries}) reached`,
  });
  return;
}

// Calcula delay: 5s, 10s, 20s, 40s, 80s
const delay = this.retryBaseDelay * Math.pow(2, retryCount);

// Agenda reconexão
const timeout = setTimeout(async () => {
  this.retryCounts.set(sessionId, retryCount + 1);
  await this.startSession(sessionId);
}, delay);

this.reconnectTimeouts.set(sessionId, timeout);
```

**Sequência de delays**:
- Tentativa 1: 5s
- Tentativa 2: 10s
- Tentativa 3: 20s
- Tentativa 4: 40s
- Tentativa 5: 80s
- **Total:** 155s (~2,5 minutos)

---

##### **handleMessagesUpsert(sessionId, socket, m)**
Processa mensagens recebidas do WhatsApp.

**Fluxo**:
1. Filtra apenas mensagens tipo `'notify'`
2. Itera sobre cada mensagem
3. Ignora mensagens enviadas pelo bot (`fromMe: true`)
4. Extrai conteúdo via `extractMessageContent()`
5. Enfileira para processamento: `enqueueReceiveMessage()`

**Exemplo de mensagem processada**:
```javascript
{
  sessionId: 'session-001',
  waMessageId: '3EB0XXXXXXXXXXX',
  from: '5511999998888@s.whatsapp.net',
  type: 'text',
  content: { text: 'Olá!' },
  timestamp: 1735689123
}
```

---

##### **extractMessageContent(message)**
Extrai conteúdo de mensagem Baileys para formato normalizado.

**Tipos suportados**:

**Texto**:
```javascript
// Simples
{ conversation: 'Hello' }
→ { type: 'text', payload: { text: 'Hello' } }

// Extended (com reply/mentions)
{ extendedTextMessage: { text: 'Hello @user' } }
→ { type: 'text', payload: { text: 'Hello @user' } }
```

**Imagem**:
```javascript
{ imageMessage: { caption: 'Photo', mimetype: 'image/jpeg', url: '...' } }
→ { type: 'image', payload: { caption: 'Photo', mimetype: '...', url: '...' } }
```

**Vídeo, Áudio, Documento**: Similar à imagem

**Desconhecido**:
```javascript
{ unknownMessageType: { ... } }
→ { type: 'unknown', payload: { ... } }
```

---

##### **getDisconnectReason(statusCode)**
Mapeia códigos de desconexão Baileys para strings legíveis.

```javascript
const reasons = {
  [DisconnectReason.badSession]: 'Bad Session File',
  [DisconnectReason.connectionClosed]: 'Connection Closed',
  [DisconnectReason.connectionLost]: 'Connection Lost',
  [DisconnectReason.connectionReplaced]: 'Connection Replaced',
  [DisconnectReason.loggedOut]: 'Logged Out',
  [DisconnectReason.restartRequired]: 'Restart Required',
  [DisconnectReason.timedOut]: 'Timed Out',
};
```

---

##### **getAuthDataDir(sessionId)**
Retorna caminho para diretório de autenticação.

```javascript
getAuthDataDir(sessionId) {
  return path.join(config.baileys.authDataDir, sessionId);
}
// Resultado: '/path/to/zaphub/auth_data/session-uuid-123'
```

---

##### **clearAuthData(sessionId)**
Remove diretório de autenticação (força re-autenticação).

```javascript
await clearAuthData('session-001');
// Apaga: auth_data/session-001/
```

---

#### Singleton Pattern

```javascript
let connectionManagerInstance = null;

export function getConnectionManager() {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
  }
  return connectionManagerInstance;
}
```

**Por que singleton?**
- Evita múltiplas instâncias gerenciando os mesmos sockets
- Garante estado global único
- Facilita acesso em qualquer módulo

---

### 2. `src/core/sessionRecovery.js`

Utilitários para recuperação de sessões ativas após restart do worker.

#### **recoverActiveSessions()**
Busca sessões ativas no banco e tenta reconectá-las.

**Query SQL**:
```sql
SELECT id, label, status, config
FROM sessions
WHERE status IN ('connected', 'reconnecting', 'qr_pending', 'initializing')
ORDER BY last_seen DESC
```

**Lógica**:
```javascript
const sessions = await pool.query(...);
const recoveryPromises = sessions.rows.map(async (session) => {
  try {
    await connectionManager.startSession(session.id, session.config);
    return { sessionId: session.id, success: true };
  } catch (err) {
    return { sessionId: session.id, success: false, error: err.message };
  }
});

const results = await Promise.all(recoveryPromises);
```

**Uso no worker**:
```javascript
// src/workers/index.js
async function startWorkers() {
  initializeQueues();
  createWorkers();

  // Recupera sessões ativas
  const results = await recoverActiveSessions();
  logger.info({ recoveredCount: results.filter(r => r.success).length });
}
```

---

#### **shutdownAllSessions()**
Encerra todas as sessões graciosamente.

```javascript
export async function shutdownAllSessions() {
  const connectionManager = getConnectionManager();
  await connectionManager.shutdown();
}
```

**Uso no graceful shutdown**:
```javascript
process.on('SIGTERM', async () => {
  await shutdownAllSessions();
  await closeWorkers();
  await closeRedis();
  await closeDb();
  process.exit(0);
});
```

---

### 3. Integração com Workers

#### **sessionInitWorker.js** (Atualizado)

**Antes** (mock):
```javascript
async function processSessionInit(job) {
  // TODO: Integrate with ConnectionManager
  await simulateWork();
  return { success: true, status: 'qr_pending (mock)' };
}
```

**Depois** (real):
```javascript
import { getConnectionManager } from '../core/ConnectionManager.js';

async function processSessionInit(job) {
  const { sessionId, config } = job.data;
  const manager = getConnectionManager();

  // Inicia sessão real
  await manager.startSession(sessionId, config);

  const status = manager.getStatus(sessionId);
  return { success: true, sessionId, status };
}
```

---

#### **messageSendWorker.js** (Atualizado)

**Antes** (mock):
```javascript
// Mock WhatsApp response
const waMessageId = `wamid.${Date.now()}_${Math.random()}`;
await updateMessageStatus(messageDbId, 'sent', { waMessageId });
```

**Depois** (real):
```javascript
import { getConnectionManager } from '../core/ConnectionManager.js';

async function processSendMessage(job) {
  const { messageDbId, sessionId, jid, payload } = job.data;
  const manager = getConnectionManager();

  // Verifica se sessão está conectada
  if (!manager.isConnected(sessionId)) {
    throw new Error(`Session ${sessionId} is not connected`);
  }

  // Envia mensagem real via Baileys
  const result = await manager.sendMessage(sessionId, jid, payload);

  const waMessageId = result.key.id; // ID real do WhatsApp
  const waTimestamp = result.messageTimestamp;

  await updateMessageStatus(messageDbId, 'sent', { waMessageId, waTimestamp });
}
```

---

## 🔧 Gerenciamento de Auth Data

### Estrutura de Diretórios

```
zaphub/
└── auth_data/
    ├── session-uuid-001/
    │   ├── creds.json             # Credenciais de autenticação
    │   ├── app-state-sync-key-*.json
    │   ├── pre-key-*.json
    │   └── session-*.json
    ├── session-uuid-002/
    │   └── ...
    └── session-uuid-003/
        └── ...
```

### Isolamento por Sessão

**Problema**: Se múltiplas sessões compartilham o mesmo `auth_data/`, ocorre conflito.

**Solução**: Cada sessão tem subdiretório próprio:
```javascript
const authDir = path.join(config.baileys.authDataDir, sessionId);
// '/home/user/zaphub/auth_data/session-uuid-123'
```

### Quando Limpar Auth Data?

**Cenário 1: Logged Out**
```javascript
if (statusCode === DisconnectReason.loggedOut) {
  await this.clearAuthData(sessionId);
  // Usuário precisa escanear novo QR
}
```

**Cenário 2: Bad Session**
```javascript
if (statusCode === DisconnectReason.badSession) {
  await this.clearAuthData(sessionId);
  await this.startSession(sessionId); // Força nova autenticação
}
```

**Cenário 3: Manual (via API)**
```javascript
// DELETE /connections/:id
await manager.stopSession(sessionId);
await manager.clearAuthData(sessionId);
```

---

## 🔄 Reconexão Automática

### Estratégia: Exponential Backoff

**Por que exponential backoff?**
- Evita "thundering herd" (múltiplas reconexões simultâneas)
- Dá tempo para WhatsApp resolver problemas de infraestrutura
- Reduz carga no servidor

### Implementação

```javascript
// Delay = baseDelay * 2^retryCount
const delays = [
  5000,   // 5s  (retryCount=0)
  10000,  // 10s (retryCount=1)
  20000,  // 20s (retryCount=2)
  40000,  // 40s (retryCount=3)
  80000,  // 80s (retryCount=4)
];

// Total: 155 segundos (~2,5 minutos)
```

### Fluxograma de Reconexão

```
Connection Lost
      │
      ▼
  retryCount < maxRetries?
      │
      ├─ YES ──► Calculate delay
      │           │
      │           ▼
      │       Schedule reconnect
      │       (setTimeout)
      │           │
      │           ▼
      │       Attempt startSession()
      │           │
      │           ├─ SUCCESS ──► CONNECTED (retryCount=0)
      │           └─ FAILURE ──► retryCount++, loop back
      │
      └─ NO ──► Update status='failed'
                Send alert/notification
```

### Cancelamento de Reconexão

Se usuário chama `stopSession()` durante reconexão:
```javascript
async stopSession(sessionId) {
  const timeout = this.reconnectTimeouts.get(sessionId);
  if (timeout) {
    clearTimeout(timeout); // Cancela reconnect agendado
    this.reconnectTimeouts.delete(sessionId);
  }
  // ... continue com logout
}
```

---

## 📊 Eventos e Webhooks

### Eventos Registrados no Banco

Todos os eventos são persistidos na tabela `events` para auditoria.

**Tipos de eventos**:
```javascript
'session.initializing'
'session.qr_generated'
'session.connected'
'session.disconnected'
'session.logged_out'
'session.reconnecting'
'session.reconnect_failed'
'session.stopped'
'message.received'
```

**Exemplo de registro**:
```javascript
await createEvent({
  sessionId: 'session-001',
  eventType: 'session.connected',
  eventCategory: 'session',
  payload: { timestamp: '2025-11-13T10:30:00Z' },
  severity: 'info',
});
```

### Webhooks Automáticos

Se sessão tem `webhook_url` configurado, dispara notificações para:
- **QR code gerado**: Cliente precisa escanear
- **Sessão conectada**: Pronto para enviar mensagens
- **Mensagem recebida**: Novo conteúdo inbound

**Exemplo de payload de webhook**:
```json
{
  "event": "session.qr_generated",
  "sessionId": "session-uuid-123",
  "payload": {
    "qr": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "timestamp": "2025-11-13T10:30:00.000Z"
  },
  "timestamp": "2025-11-13T10:30:00.000Z",
  "deliveryId": "webhook-delivery-uuid"
}
```

**Headers enviados**:
```
Content-Type: application/json
X-ZapHub-Event: session.qr_generated
X-ZapHub-Session: session-uuid-123
X-ZapHub-Delivery: webhook-delivery-uuid
```

---

## 🚀 Como Usar

### 1. Iniciar uma Sessão

```javascript
import { getConnectionManager } from './src/core/ConnectionManager.js';
import { createSession } from './src/db/repositories/sessions.js';

// Criar registro no banco
const session = await createSession({
  label: 'Vendas - WhatsApp',
  webhook_url: 'https://myapp.com/webhooks/whatsapp',
  config: { autoReply: false },
});

// Iniciar conexão
const manager = getConnectionManager();
await manager.startSession(session.id);

// Verificar status
console.log(manager.getStatus(session.id)); // 'qr_pending' ou 'connecting'
```

### 2. Obter QR Code

```javascript
import { getSessionById } from './src/db/repositories/sessions.js';

const session = await getSessionById(sessionId);
if (session.status === 'qr_pending') {
  console.log('QR Code:', session.qr_code);
  // Exibir para usuário escanear
}
```

### 3. Enviar Mensagem

```javascript
const manager = getConnectionManager();

if (!manager.isConnected(sessionId)) {
  throw new Error('Session not connected');
}

await manager.sendMessage(
  sessionId,
  '5511999998888@s.whatsapp.net',
  { text: 'Olá! Mensagem via API.' }
);
```

### 4. Receber Mensagens

Mensagens são **automaticamente** enfileiradas quando recebidas:

```javascript
// Dentro de ConnectionManager.handleMessagesUpsert()
await enqueueReceiveMessage(
  sessionId,
  waMessageId,
  from,
  type,
  content,
  timestamp
);

// Worker processa e:
// 1. Salva no DB
// 2. Dispara webhook (se configurado)
```

### 5. Parar Sessão

```javascript
await manager.stopSession(sessionId, 'manual_disconnect');

// Limpar credenciais (força novo QR)
await manager.clearAuthData(sessionId);
```

### 6. Recuperar Sessões (Worker Startup)

```javascript
// src/workers/index.js
import { recoverActiveSessions } from './src/core/sessionRecovery.js';

async function startWorkers() {
  // ... inicializar workers

  const results = await recoverActiveSessions();
  console.log(`Recovered ${results.filter(r => r.success).length} sessions`);
}
```

---

## 🔍 Troubleshooting

### Problema: Sessão não conecta (fica em qr_pending)

**Diagnóstico**:
```javascript
const session = await getSessionById(sessionId);
console.log('Status:', session.status);
console.log('QR Code:', session.qr_code);
console.log('Last QR generated:', session.last_qr_at);
```

**Causas comuns**:
- QR code não foi escaneado
- QR code expirou (>60s)
- Problema de rede no WhatsApp

**Solução**:
- Reexibir QR code para usuário
- Regenerar QR: `await manager.stopSession(sessionId); await manager.startSession(sessionId);`

---

### Problema: Sessão desconecta repetidamente

**Diagnóstico**:
```javascript
const session = await getSessionById(sessionId);
console.log('Retry count:', session.retry_count);
console.log('Error:', session.error_message);
```

**Causas comuns**:
- Conexão instável (ConnectionLost)
- Auth data corrompido (BadSession)
- WhatsApp bloqueou temporariamente

**Solução**:
```javascript
// Se BadSession
await manager.clearAuthData(sessionId);
await manager.startSession(sessionId); // Nova autenticação

// Se bloqueio temporário
// Aguardar algumas horas e tentar novamente
```

---

### Problema: Erro "Session not connected" ao enviar mensagem

**Diagnóstico**:
```javascript
const manager = getConnectionManager();
console.log('Is connected?', manager.isConnected(sessionId));
console.log('Status:', manager.getStatus(sessionId));

const socket = manager.getSocket(sessionId);
console.log('Has socket?', !!socket);
console.log('Socket user?', socket?.user);
```

**Causas**:
- Sessão ainda não autenticada
- Sessão foi desconectada
- Socket não existe

**Solução**:
```javascript
// Verificar antes de enviar
if (!manager.isConnected(sessionId)) {
  // Re-iniciar sessão ou aguardar conexão
  await manager.startSession(sessionId);
}
```

---

### Problema: Auth data não persiste entre restarts

**Diagnóstico**:
```bash
ls -la auth_data/<sessionId>/
# Deve conter: creds.json, app-state-sync-key-*.json, etc.
```

**Causas**:
- Diretório `auth_data/` sendo apagado
- Permissões de escrita incorretas
- Docker volume não montado corretamente

**Solução**:
```bash
# Verificar permissões
chmod 755 auth_data/

# Se Docker, verificar volume
docker-compose.yml:
  volumes:
    - ./auth_data:/app/auth_data
```

---

## 📈 Monitoramento e Observabilidade

### Métricas Importantes

**1. Total de Sessões Ativas**
```javascript
const manager = getConnectionManager();
console.log('Active sessions:', manager.getSessionCount());
```

**2. Lista de Sessões Conectadas**
```javascript
const activeSessions = manager.getActiveSessions();
console.log('Connected sessions:', activeSessions);
// ['session-001', 'session-002', ...]
```

**3. Status Agregado**
```javascript
const pool = getDbPool();
const result = await pool.query(`
  SELECT status, COUNT(*) as count
  FROM sessions
  GROUP BY status
`);
console.log(result.rows);
/*
[
  { status: 'connected', count: 15 },
  { status: 'qr_pending', count: 3 },
  { status: 'disconnected', count: 2 },
  { status: 'failed', count: 1 }
]
*/
```

### Logs Estruturados

Todos os logs incluem contexto:
```json
{
  "level": "info",
  "time": 1735689123456,
  "msg": "[ConnectionManager] Session connected",
  "sessionId": "session-uuid-123",
  "status": "connected"
}
```

**Busca por sessão específica**:
```bash
# Com pino-pretty
npm start | grep "session-uuid-123"

# Com jq (JSON query)
npm start | jq 'select(.sessionId == "session-uuid-123")'
```

### Alertas Recomendados

**1. Taxa de Falhas Alta**
```sql
SELECT COUNT(*)
FROM sessions
WHERE status = 'failed'
  AND updated_at > NOW() - INTERVAL '1 hour';
```
Se > 5, enviar alerta.

**2. Sessões sem Heartbeat**
```sql
SELECT id, label, last_seen
FROM sessions
WHERE status = 'connected'
  AND last_seen < NOW() - INTERVAL '10 minutes';
```
Possível problema de rede ou crash.

**3. Múltiplas Reconexões**
```sql
SELECT id, label, retry_count
FROM sessions
WHERE retry_count >= 3
  AND status = 'reconnecting';
```
Investigar causa raiz.

---

## 🧪 Testes

### Teste Manual: Fluxo Completo

```javascript
// 1. Criar sessão
const session = await createSession({ label: 'Test Session' });

// 2. Iniciar conexão
const manager = getConnectionManager();
await manager.startSession(session.id);

// 3. Aguardar QR
await new Promise(resolve => setTimeout(resolve, 3000));
const s = await getSessionById(session.id);
console.log('QR:', s.qr_code);

// 4. Após escanear QR (manual), verificar conexão
await new Promise(resolve => setTimeout(resolve, 10000));
console.log('Connected?', manager.isConnected(session.id));

// 5. Enviar mensagem de teste
await manager.sendMessage(
  session.id,
  '5511999998888@s.whatsapp.net',
  { text: 'Test message' }
);

// 6. Parar sessão
await manager.stopSession(session.id);
```

### Teste de Reconexão

```javascript
// 1. Iniciar sessão conectada
await manager.startSession(sessionId);

// 2. Simular desconexão (forçar)
const socket = manager.getSocket(sessionId);
socket.end(); // Fecha socket

// 3. Observar logs de reconexão automática
// Deve tentar reconectar com delays: 5s, 10s, 20s...

// 4. Verificar retry count
const session = await getSessionById(sessionId);
console.log('Retry count:', session.retry_count);
```

### Teste de Recuperação (Session Recovery)

```bash
# 1. Iniciar worker com sessões ativas
node src/workers/index.js

# 2. Aguardar conexões estabelecidas

# 3. Matar processo (CTRL+C)

# 4. Reiniciar worker
node src/workers/index.js

# 5. Observar logs:
# [SessionRecovery] Found 3 sessions to recover
# [SessionRecovery] Recovering session session-001...
# [SessionRecovery] Session recovered
# ...
```

---

## 🎯 Próximos Passos

### Etapa 5: API Endpoints (Sessions CRUD)
- `POST /connections` → Cria sessão e enfileira init
- `GET /connections` → Lista todas as sessões
- `GET /connections/:id` → Detalhes da sessão + QR code
- `DELETE /connections/:id` → Para e remove sessão
- `GET /connections/:id/status` → Status em tempo real

### Etapa 6: API Endpoint (Send Message)
- `POST /connections/:id/send` → Enfileira mensagem
- Validação de payload (Joi schemas)
- Idempotência via `messageId`
- Rate limiting por sessionId

### Etapa 7: Implementar Rate Limiting
- Redis-based counter por sessionId
- Limite: 80 msgs/minuto (WhatsApp limit)
- Delay automático quando atingir limite

### Etapa 8: Dashboard de Monitoramento
- Interface web para visualizar sessões ativas
- Exibir QR codes para escanear
- Métricas em tempo real
- Logs centralizados

---

## 📝 Checklist de Validação

- [x] ConnectionManager singleton implementado
- [x] Métodos start/stop/sendMessage funcionais
- [x] Event handlers configurados (connection, messages, creds)
- [x] Reconexão automática com exponential backoff
- [x] Auth data isolado por sessionId
- [x] Integração com PostgreSQL (sessions, events)
- [x] Integração com filas (message:receive, webhook)
- [x] Workers atualizados (sessionInit, messageSend)
- [x] Session recovery implementado
- [x] Graceful shutdown implementado
- [x] Logs estruturados em todos os pontos
- [x] Extração de conteúdo de mensagens (text, image, video, etc.)
- [x] Webhook dispatch automático
- [x] Tratamento de logged_out (clear auth_data)
- [x] Documentação completa

---

## 🔗 Referências

- [Baileys Documentation](https://whiskeysockets.github.io/)
- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)
- [WhatsApp Web Protocol](https://github.com/sigalor/whatsapp-web-reveng)
- [Exponential Backoff Best Practices](https://cloud.google.com/iot/docs/how-tos/exponential-backoff)

---

## 📌 Conclusão

A **Etapa 4** estabeleceu o **núcleo operacional** do sistema de conexões WhatsApp:

✅ **Gerenciamento robusto** de sockets Baileys  
✅ **Reconexão inteligente** com exponential backoff  
✅ **Isolamento de sessões** com auth_data separado  
✅ **Integração completa** com workers e banco de dados  
✅ **Recuperação automática** de sessões após restart  
✅ **Eventos e webhooks** para visibilidade externa  

**O sistema agora é capaz de**:
- Gerenciar **centenas de sessões** simultâneas
- **Reconectar automaticamente** em caso de falhas
- **Processar mensagens** inbound e outbound via filas
- **Recuperar estado** após restart do processo

**Próximo passo**: Expor APIs REST para que aplicações externas possam criar sessões e enviar mensagens através do sistema.

---

**Data de Conclusão**: 2025-11-13  
**Arquivos Criados**: 3  
**Arquivos Modificados**: 3  
**Linhas de Código**: ~1.200  
**Status**: ✅ **ETAPA CONCLUÍDA**
