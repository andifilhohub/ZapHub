# Etapa 05 - API Endpoints (Sessions CRUD)

## 📋 Sumário Executivo

### Objetivo da Etapa
Implementar **API REST** completa para gerenciamento de sessões WhatsApp, permitindo que aplicações externas criem, listem, atualizem, deletem e monitorem conexões através de endpoints HTTP.

### Motivação
A API é a **interface principal** para interagir com o sistema ZapHub:
1. **Criar sessões** e obter QR codes para autenticação
2. **Listar e monitorar** todas as sessões ativas
3. **Atualizar configurações** (webhook, labels)
4. **Encerrar sessões** quando não mais necessárias
5. **Proteger acesso** via API keys
6. **Validar dados** para prevenir erros

### Componentes Implementados
```
src/api/
├── validators/
│   └── sessionValidators.js       # Schemas Joi para validação
├── controllers/
│   └── sessionController.js       # Lógica de negócio dos endpoints
├── routes/
│   ├── sessions.js                # Rotas de sessões
│   └── index.js                   # Agregador de rotas
└── middleware/
    ├── auth.js                    # Autenticação via API Key
    ├── errorHandler.js            # Tratamento centralizado de erros
    ├── validate.js                # Middleware de validação
    └── index.js                   # Barrel export

src/server/
└── app.js                         # Servidor atualizado com novas rotas
```

---

## 🏗️ Arquitetura da API

### Visão Geral
```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APP                               │
│  (Frontend, Mobile, Integration Service)                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │ HTTP Request
                  │ Authorization: Bearer <api-key>
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ MIDDLEWARE CHAIN                                           │ │
│  │                                                             │ │
│  │  1. CORS                → Allow cross-origin requests     │ │
│  │  2. Body Parser         → Parse JSON/URL-encoded         │ │
│  │  3. Request Logger      → Log all requests                │ │
│  │  4. Auth Middleware     → Validate API key                │ │
│  │  5. Validation Middleware → Validate request data         │ │
│  │  6. Controller          → Business logic                  │ │
│  │  7. Error Handler       → Centralized error response      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ROUTES:                                                          │
│  POST   /api/v1/sessions              → Create session          │
│  GET    /api/v1/sessions              → List sessions           │
│  GET    /api/v1/sessions/:id          → Get session details     │
│  PATCH  /api/v1/sessions/:id          → Update session          │
│  DELETE /api/v1/sessions/:id          → Delete session          │
│  GET    /api/v1/sessions/:id/qr       → Get QR code             │
│  GET    /api/v1/sessions/:id/status   → Get status              │
│  POST   /api/v1/sessions/:id/restart  → Restart session         │
│  GET    /api/v1/health                → Health check            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS LAYER                                │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ ConnectionManager│  │ Session Repo     │  │ Queue Manager│  │
│  │ (Socket control) │  │ (DB operations)  │  │ (BullMQ)     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Request/Response Flow

**Exemplo: POST /api/v1/sessions**
```
1. Client sends:
   POST /api/v1/sessions
   Authorization: Bearer secret-api-key-123
   Content-Type: application/json
   
   {
     "label": "Vendas WhatsApp",
     "webhook_url": "https://myapp.com/webhook"
   }

2. CORS middleware → Allow request

3. Auth middleware → Validate API key
   ✓ Valid → Continue
   ✗ Invalid → 401 Unauthorized

4. Validation middleware → Validate body
   ✓ Valid → Continue
   ✗ Invalid → 400 Bad Request

5. Controller → createSessionController()
   - createSession() → Insert into DB
   - enqueueSessionInit() → Add job to BullMQ
   - Return response

6. Response:
   201 Created
   {
     "success": true,
     "data": {
       "id": "uuid-123",
       "label": "Vendas WhatsApp",
       "status": "initializing",
       "created_at": "2025-11-13T10:30:00Z"
     },
     "message": "Session created successfully. Initialization in progress."
   }
```

---

## 📁 Estrutura de Arquivos

### 1. `src/api/validators/sessionValidators.js`

Schemas Joi para validação de requests.

#### **createSessionSchema**
Valida criação de sessão.

```javascript
export const createSessionSchema = Joi.object({
  label: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .description('Human-readable label for the session'),

  webhook_url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(null, '')
    .description('Webhook URL for receiving events'),

  config: Joi.object({
    autoReply: Joi.boolean().optional(),
    markOnlineOnConnect: Joi.boolean().optional(),
    syncFullHistory: Joi.boolean().optional(),
    retryLimit: Joi.number().integer().min(0).max(10).optional(),
  })
    .optional()
    .description('Session configuration options'),
});
```

**Validações**:
- `label`: Obrigatório, 1-100 caracteres
- `webhook_url`: Opcional, deve ser URL válida (http/https)
- `config`: Opcional, objeto com configurações

**Exemplo válido**:
```json
{
  "label": "Support Team",
  "webhook_url": "https://api.example.com/webhooks/whatsapp",
  "config": {
    "autoReply": true,
    "retryLimit": 5
  }
}
```

---

#### **updateSessionSchema**
Valida atualização de sessão.

```javascript
export const updateSessionSchema = Joi.object({
  label: Joi.string().trim().min(1).max(100).optional(),
  webhook_url: Joi.string().uri().optional().allow(null, ''),
  config: Joi.object({ ... }).optional(),
}).min(1); // At least one field must be provided
```

**Diferença do create**:
- Todos os campos são opcionais
- Requer ao menos 1 campo (`.min(1)`)

---

#### **listSessionsSchema**
Valida query parameters para listagem.

```javascript
export const listSessionsSchema = Joi.object({
  status: Joi.string()
    .valid('initializing', 'qr_pending', 'connected', 'disconnected', ...)
    .optional(),
  
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
  offset: Joi.number().integer().min(0).default(0).optional(),
  sortBy: Joi.string().valid('created_at', 'updated_at', ...).default('created_at').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc').optional(),
});
```

**Exemplo de uso**:
```
GET /api/v1/sessions?status=connected&limit=10&sortBy=last_seen&sortOrder=desc
```

---

### 2. `src/api/controllers/sessionController.js`

Controladores com lógica de negócio.

#### **createSessionController**
Cria nova sessão.

**Fluxo**:
```javascript
export async function createSessionController(req, res, next) {
  try {
    const { label, webhook_url, config } = req.body;

    // 1. Create in database
    const session = await createSession({
      label,
      webhook_url: webhook_url || null,
      config: config || {},
    });

    // 2. Enqueue initialization job
    await enqueueSessionInit(session.id, label, config || {});

    // 3. Return response
    res.status(201).json({
      success: true,
      data: { id: session.id, label: session.label, status: session.status, ... },
      message: 'Session created successfully. Initialization in progress.',
    });
  } catch (err) {
    next(err); // Pass to error handler
  }
}
```

**Status Code**: `201 Created`

**Response Example**:
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "label": "Sales Team",
    "status": "initializing",
    "webhook_url": "https://example.com/webhook",
    "config": {},
    "created_at": "2025-11-13T10:30:00.000Z"
  },
  "message": "Session created successfully. Initialization in progress."
}
```

---

#### **listSessionsController**
Lista todas as sessões com filtros.

**Features**:
- Filtro por status
- Paginação (limit/offset)
- Ordenação customizável
- **Enrichment** com status em tempo real

**Enrichment**:
```javascript
const connectionManager = getConnectionManager();

const enrichedSessions = sessions.map((session) => ({
  ...session,
  qr_code: session.qr_code ? '[HIDDEN]' : null, // Hide QR in list
  runtime_status: connectionManager.getStatus(session.id), // Real-time
  is_connected: connectionManager.isConnected(session.id),
}));
```

**Response Example**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "label": "Sales",
      "status": "connected",
      "runtime_status": "connected",
      "is_connected": true,
      "last_seen": "2025-11-13T10:35:00Z",
      ...
    },
    {
      "id": "uuid-2",
      "label": "Support",
      "status": "qr_pending",
      "runtime_status": "connecting",
      "is_connected": false,
      ...
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

---

#### **getSessionController**
Obtém detalhes de uma sessão específica.

**Diferença da listagem**:
- Inclui **QR code completo** (se disponível)
- Mais detalhes de timestamps
- Mensagem de erro (se houver)

**Response Example**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "label": "Sales Team",
    "status": "qr_pending",
    "qr_code": "2@abcdefghijklmnop...",
    "last_qr_at": "2025-11-13T10:30:00Z",
    "runtime_status": "connecting",
    "is_connected": false,
    "error_message": null,
    "retry_count": 0,
    ...
  }
}
```

---

#### **updateSessionController**
Atualiza dados da sessão.

**Campos atualizáveis**:
- `label`: Nome da sessão
- `webhook_url`: URL de webhook
- `config`: Configurações (merge com existente)

**Config Merge**:
```javascript
if (config !== undefined) {
  updates.config = { ...existingSession.config, ...config };
}
```

**Exemplo**:
```
PATCH /api/v1/sessions/uuid-123
{
  "label": "New Label",
  "config": { "autoReply": false }
}
```

Se `existingSession.config = { retryLimit: 3 }`, resultado será:
```json
{ "retryLimit": 3, "autoReply": false }
```

---

#### **deleteSessionController**
Deleta sessão e encerra conexão.

**Fluxo**:
1. Verifica se sessão existe
2. Enfileira job de encerramento (`enqueueSessionClose`)
3. Remove registro do banco
4. Retorna sucesso

**Importante**: O job worker irá chamar `ConnectionManager.stopSession()` de forma assíncrona.

---

#### **getQRCodeController**
Retorna QR code para autenticação.

**Formatos suportados**:
- `raw`: String bruta do QR
- `base64`: Base64 encoded
- `data_url`: Data URL completa (default para alguns casos)

**Query Parameter**:
```
GET /api/v1/sessions/:id/qr?format=base64
```

**Validações**:
- Sessão deve existir
- QR code deve estar disponível
- QR não deve estar expirado (>60s)

**Response Example**:
```json
{
  "success": true,
  "data": {
    "qr_code": "iVBORw0KGgoAAAANS...",
    "generated_at": "2025-11-13T10:30:00Z"
  }
}
```

**Erro se expirado**:
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "QR code expired. Please request a new session initialization."
  }
}
```

---

#### **getSessionStatusController**
Obtém status em tempo real da sessão.

**Diferença do GET /sessions/:id**:
- Foco em informações de status
- Informação se QR está disponível
- Expiração do QR calculada

**Response Example**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "label": "Sales",
    "db_status": "qr_pending",
    "runtime_status": "connecting",
    "is_connected": false,
    "last_seen": null,
    "connected_at": null,
    "disconnected_at": null,
    "error_message": null,
    "retry_count": 0,
    "has_qr_code": true,
    "qr_expires_at": "2025-11-13T10:31:00.000Z"
  }
}
```

---

#### **restartSessionController**
Reinicia sessão (para e reinicializa).

**Casos de uso**:
- Sessão travada em estado inconsistente
- Forçar nova autenticação (novo QR)
- Reset após erro persistente

**Fluxo**:
1. Para sessão ativa (se existir)
2. Limpa `auth_data/<sessionId>/`
3. Enfileira nova inicialização

**Response**:
```json
{
  "success": true,
  "message": "Session restart initiated. New QR code will be generated."
}
```

---

### 3. `src/api/middleware/auth.js`

Middleware de autenticação via API Key.

#### **authenticateApiKey**
Valida API key em requests.

**Métodos suportados**:

**1. Header Authorization**:
```
Authorization: Bearer your-secret-api-key-here
```

**2. Query Parameter**:
```
?api_key=your-secret-api-key-here
```

**Implementação**:
```javascript
export function authenticateApiKey(req, res, next) {
  if (!config.security.apiKeyEnabled) {
    return next(); // Skip if disabled
  }

  let apiKey = null;

  // Extract from header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  }

  // Extract from query
  if (!apiKey && req.query.api_key) {
    apiKey = req.query.api_key;
  }

  if (!apiKey) {
    return next(new UnauthorizedError('API key is required'));
  }

  if (apiKey !== config.security.apiKey) {
    return next(new UnauthorizedError('Invalid API key'));
  }

  next();
}
```

**Configuração** (`.env`):
```
API_KEY_ENABLED=true
API_KEY=my-super-secret-key-change-in-production
```

---

### 4. `src/api/middleware/errorHandler.js`

Tratamento centralizado de erros.

#### **errorHandler**
Converte erros em responses JSON padronizadas.

**Tipos de erro tratados**:

**1. Joi Validation Errors**:
```javascript
if (err.isJoi) {
  const message = err.details.map(d => d.message).join('; ');
  err = new ValidationError(message);
}
```

**2. Application Errors** (ValidationError, NotFoundError, etc.):
```javascript
if (err instanceof AppError) {
  return res.status(err.statusCode).json({
    success: false,
    error: {
      type: err.constructor.name,
      message: err.message,
    },
  });
}
```

**3. PostgreSQL Errors**:
```javascript
const pgErrors = {
  '23505': { status: 409, message: 'Resource already exists (duplicate)' },
  '23503': { status: 400, message: 'Foreign key constraint violation' },
  '22P02': { status: 400, message: 'Invalid input format' },
};
```

**4. Unknown Errors** (500):
```javascript
res.status(500).json({
  success: false,
  error: {
    type: 'InternalServerError',
    message: 'An unexpected error occurred',
    ...(isDevelopment && { details: err.message, stack: err.stack }),
  },
});
```

---

#### **notFoundHandler**
Handler para rotas não encontradas (404).

```javascript
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      type: 'NotFoundError',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
```

---

### 5. `src/api/middleware/validate.js`

Middleware de validação Joi.

#### **validateBody**
Valida `req.body`.

```javascript
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,     // Return all errors
      stripUnknown: true,    // Remove unknown fields
    });

    if (error) {
      const message = error.details.map(d => d.message).join('; ');
      return next(new ValidationError(message));
    }

    req.body = value; // Replace with validated/sanitized value
    next();
  };
}
```

**Uso**:
```javascript
router.post('/', validateBody(createSessionSchema), controller);
```

---

#### **validateParams**
Valida `req.params` (ex: `:id`).

**Uso**:
```javascript
router.get('/:id', validateParams(sessionIdSchema), controller);
```

---

#### **validateQuery**
Valida `req.query` (query parameters).

**Uso**:
```javascript
router.get('/', validateQuery(listSessionsSchema), controller);
```

---

### 6. `src/api/routes/sessions.js`

Definição das rotas de sessões.

```javascript
import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { ... } from '../validators/sessionValidators.js';
import { ... } from '../controllers/sessionController.js';

const router = express.Router();

// POST /api/v1/sessions
router.post(
  '/',
  authenticateApiKey,
  validateBody(createSessionSchema),
  createSessionController
);

// GET /api/v1/sessions
router.get(
  '/',
  authenticateApiKey,
  validateQuery(listSessionsSchema),
  listSessionsController
);

// ... other routes

export default router;
```

**Ordem dos middlewares** é importante:
1. Autenticação (rejeita se não autorizado)
2. Validação (rejeita se dados inválidos)
3. Controller (executa lógica)

---

### 7. `src/server/app.js`

Servidor atualizado com novas rotas.

**Mudanças principais**:
```javascript
import apiRoutes from '../api/routes/index.js';
import { errorHandler, notFoundHandler } from '../api/middleware/errorHandler.js';

// ...

// API v1 routes
app.use('/api/v1', apiRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);
```

**Ordem de middlewares no Express**:
```
1. CORS
2. Body Parser
3. Request Logger
4. Static Files
5. Legacy Routes (/)
6. API Routes (/api/v1)
7. 404 Handler  ← Catch all unmatched routes
8. Error Handler ← Catch all errors from previous middlewares
```

---

## 🚀 Endpoints da API

### Resumo de Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/v1/sessions` | Create new session | ✅ |
| `GET` | `/api/v1/sessions` | List all sessions | ✅ |
| `GET` | `/api/v1/sessions/:id` | Get session details | ✅ |
| `PATCH` | `/api/v1/sessions/:id` | Update session | ✅ |
| `DELETE` | `/api/v1/sessions/:id` | Delete session | ✅ |
| `GET` | `/api/v1/sessions/:id/qr` | Get QR code | ✅ |
| `GET` | `/api/v1/sessions/:id/status` | Get real-time status | ✅ |
| `POST` | `/api/v1/sessions/:id/restart` | Restart session | ✅ |
| `GET` | `/api/v1/health` | Health check | ❌ |

---

### Exemplos de Uso

#### 1. Create Session
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Sales Team WhatsApp",
    "webhook_url": "https://myapp.com/webhooks/whatsapp",
    "config": {
      "autoReply": false,
      "retryLimit": 5
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "Sales Team WhatsApp",
    "status": "initializing",
    "webhook_url": "https://myapp.com/webhooks/whatsapp",
    "config": {
      "autoReply": false,
      "retryLimit": 5
    },
    "created_at": "2025-11-13T10:30:00.000Z"
  },
  "message": "Session created successfully. Initialization in progress."
}
```

---

#### 2. Get QR Code
```bash
curl -X GET "http://localhost:3000/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/qr?format=base64" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "qr_code": "iVBORw0KGgoAAAANSUhEUgAA...",
    "generated_at": "2025-11-13T10:30:05.000Z"
  }
}
```

**Renderizar QR no frontend**:
```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." alt="QR Code">
```

---

#### 3. List Sessions
```bash
curl -X GET "http://localhost:3000/api/v1/sessions?status=connected&limit=10" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "label": "Sales Team",
      "status": "connected",
      "runtime_status": "connected",
      "is_connected": true,
      "last_seen": "2025-11-13T10:35:00Z",
      "connected_at": "2025-11-13T10:30:30Z",
      ...
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

---

#### 4. Get Session Status
```bash
curl -X GET "http://localhost:3000/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/status" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "Sales Team",
    "db_status": "connected",
    "runtime_status": "connected",
    "is_connected": true,
    "last_seen": "2025-11-13T10:35:00Z",
    "has_qr_code": false,
    "qr_expires_at": null
  }
}
```

---

#### 5. Update Session
```bash
curl -X PATCH http://localhost:3000/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Updated Sales Team",
    "webhook_url": "https://newurl.com/webhook"
  }'
```

---

#### 6. Restart Session
```bash
curl -X POST "http://localhost:3000/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000/restart" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "message": "Session restart initiated. New QR code will be generated."
}
```

---

#### 7. Delete Session
```bash
curl -X DELETE "http://localhost:3000/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer your-api-key"
```

**Response**:
```json
{
  "success": true,
  "message": "Session deleted successfully. Disconnection in progress."
}
```

---

## 🔒 Segurança

### API Key Authentication

**Configuração** (`.env`):
```bash
API_KEY_ENABLED=true
API_KEY=change-this-to-a-strong-random-key-in-production
```

**Geração de API Key segura**:
```bash
# Linux/Mac
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Boas práticas**:
- ✅ Use API keys longas (64+ caracteres)
- ✅ Rotacione periodicamente
- ✅ Use HTTPS em produção
- ✅ Não commite API keys no Git
- ✅ Um API key por aplicação cliente

**Desabilitar autenticação** (apenas desenvolvimento):
```bash
API_KEY_ENABLED=false
```

---

### CORS Configuration

**Atual** (permissivo para desenvolvimento):
```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

**Produção** (restritivo):
```javascript
app.use(cors({
  origin: ['https://myapp.com', 'https://admin.myapp.com'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

---

## 🔍 Error Handling

### Tipos de Erro

#### 1. ValidationError (400)
Dados de entrada inválidos.

**Exemplo**:
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "\"label\" is required; \"webhook_url\" must be a valid uri"
  }
}
```

---

#### 2. UnauthorizedError (401)
API key ausente ou inválida.

**Exemplo**:
```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "API key is required. Provide it via Authorization header or api_key query parameter."
  }
}
```

---

#### 3. NotFoundError (404)
Recurso não encontrado.

**Exemplo**:
```json
{
  "success": false,
  "error": {
    "type": "NotFoundError",
    "message": "Session with ID 550e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

---

#### 4. ConflictError (409)
Conflito (ex: duplicação).

**Exemplo**:
```json
{
  "success": false,
  "error": {
    "type": "ConflictError",
    "message": "Resource already exists (duplicate)"
  }
}
```

---

#### 5. InternalServerError (500)
Erro inesperado.

**Produção**:
```json
{
  "success": false,
  "error": {
    "type": "InternalServerError",
    "message": "An unexpected error occurred"
  }
}
```

**Desenvolvimento** (inclui detalhes):
```json
{
  "success": false,
  "error": {
    "type": "InternalServerError",
    "message": "An unexpected error occurred",
    "details": "Cannot read property 'id' of undefined",
    "stack": "Error: ...\n    at ..."
  }
}
```

---

## 📊 Monitoramento

### Request Logging

Todos os requests são logados:
```json
{
  "level": "info",
  "time": 1735689123456,
  "msg": "[HTTP] Incoming request",
  "method": "POST",
  "path": "/api/v1/sessions",
  "ip": "::1"
}
```

### Error Logging

Erros são logados com contexto completo:
```json
{
  "level": "error",
  "time": 1735689123456,
  "msg": "[ErrorHandler] Request error",
  "error": "Session with ID xyz not found",
  "stack": "NotFoundError: ...",
  "path": "/api/v1/sessions/xyz",
  "method": "GET",
  "statusCode": 404
}
```

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

**Response**:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "service": "ZapHub API",
  "version": "1.0.0"
}
```

---

## 🧪 Testes

### Teste Manual Completo

**1. Criar sessão**:
```bash
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"label":"Test Session"}' | jq -r '.data.id')

echo "Session ID: $SESSION_ID"
```

**2. Obter QR code**:
```bash
curl -s "http://localhost:3000/api/v1/sessions/$SESSION_ID/qr" \
  -H "Authorization: Bearer your-api-key" | jq -r '.data.qr_code'
```

**3. Verificar status** (aguardar conexão):
```bash
curl -s "http://localhost:3000/api/v1/sessions/$SESSION_ID/status" \
  -H "Authorization: Bearer your-api-key" | jq
```

**4. Listar sessões**:
```bash
curl -s "http://localhost:3000/api/v1/sessions" \
  -H "Authorization: Bearer your-api-key" | jq
```

**5. Atualizar sessão**:
```bash
curl -s -X PATCH "http://localhost:3000/api/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"label":"Updated Label"}' | jq
```

**6. Deletar sessão**:
```bash
curl -s -X DELETE "http://localhost:3000/api/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer your-api-key" | jq
```

---

### Teste de Validação

**Request inválido** (label faltando):
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response esperada**:
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "\"label\" is required"
  }
}
```

---

### Teste de Autenticação

**Sem API key**:
```bash
curl -X GET http://localhost:3000/api/v1/sessions
```

**Response esperada**:
```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "API key is required..."
  }
}
```

**API key inválida**:
```bash
curl -X GET http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer wrong-key"
```

**Response esperada**:
```json
{
  "success": false,
  "error": {
    "type": "UnauthorizedError",
    "message": "Invalid API key"
  }
}
```

---

## 🎯 Próximos Passos

### Etapa 6: API Endpoint de Envio de Mensagens
- `POST /api/v1/sessions/:id/messages` - Enviar mensagem
- Validação de tipos de mensagem (text, image, video, etc.)
- Idempotência via `messageId`
- Rate limiting por sessionId

### Etapa 7: Workers de Mensagens
- Processar fila de envio
- Processar fila de recebimento
- Atualizar status no DB

### Etapa 8: Webhooks e Notificações
- Sistema de retry para webhooks
- Templates de eventos
- Assinaturas de eventos

### Melhorias Futuras
- **Rate Limiting**: Limitar requests por IP/API key
- **JWT Authentication**: Alternativa ao API key
- **Pagination Cursor**: Paginação mais eficiente
- **OpenAPI/Swagger**: Documentação interativa
- **GraphQL**: Alternativa ao REST
- **WebSocket**: Status em tempo real

---

## 📝 Checklist de Validação

- [x] Validators criados com Joi
- [x] Controllers implementados (8 endpoints)
- [x] Middleware de autenticação (API Key)
- [x] Middleware de validação (body/params/query)
- [x] Error handler centralizado
- [x] Rotas configuradas
- [x] Servidor atualizado
- [x] CORS configurado
- [x] Request logging
- [x] Health check endpoint
- [x] Documentação completa
- [x] Exemplos de uso (curl)

---

## 🔗 Referências

- [Express.js Documentation](https://expressjs.com/)
- [Joi Validation](https://joi.dev/api/)
- [HTTP Status Codes](https://httpstatuses.com/)
- [REST API Best Practices](https://restfulapi.net/)
- [API Security Best Practices](https://owasp.org/www-project-api-security/)

---

## 📌 Conclusão

A **Etapa 5** estabeleceu a **interface HTTP completa** para gerenciamento de sessões:

✅ **8 endpoints RESTful** para CRUD completo  
✅ **Autenticação via API Key** com suporte a header e query  
✅ **Validação robusta** com Joi schemas  
✅ **Error handling centralizado** com tipos customizados  
✅ **Status em tempo real** (DB + ConnectionManager)  
✅ **QR code retrieval** com múltiplos formatos  
✅ **Paginação e filtros** para listagem  
✅ **Restart de sessões** para troubleshooting  

**O sistema agora permite**:
- Criar e gerenciar **múltiplas sessões** via API
- Obter **QR codes** para autenticação
- Monitorar **status em tempo real**
- **Atualizar configurações** dinamicamente
- **Encerrar sessões** quando necessário

**Próximo passo**: Implementar endpoint de **envio de mensagens** e integrar com sistema de filas.

---

**Data de Conclusão**: 2025-11-13  
**Arquivos Criados**: 10  
**Arquivos Modificados**: 1  
**Linhas de Código**: ~1.500  
**Status**: ✅ **ETAPA CONCLUÍDA**
