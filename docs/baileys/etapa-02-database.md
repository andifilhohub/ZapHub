# Etapa 2 — Database: Schema e Migrations

**Data:** 2025-11-13  
**Status:** ✅ Concluída  
**Responsável:** Desenvolvimento de persistência

---

## 📋 Objetivo da Etapa

Implementar a camada de persistência do ZapHub com:
- Schema completo do banco de dados (sessions, messages, events)
- Sistema de migrations versionado e rastreável
- Repositories pattern para acesso a dados
- Seeds para dados de teste
- Suporte a operações ACID e idempotência

---

## 🎯 O Que Foi Realizado

### 1. Migrations SQL Criadas

#### **001_create_sessions_table.sql**
Tabela principal para armazenar metadados de sessões/conexões WhatsApp.

**Campos principais:**
- `id` (UUID, PK) — Identificador único da sessão
- `label` (VARCHAR) — Nome amigável da sessão
- `status` (VARCHAR) — Status atual (initializing, qr_pending, connected, disconnected, etc.)
- `webhook_url` (TEXT) — URL para receber webhooks
- `config` (JSONB) — Configurações adicionais
- `qr_code` (TEXT) — QR code atual (base64/data URL)
- `last_qr_at` (TIMESTAMP) — Último QR gerado
- `created_at`, `updated_at`, `last_seen` — Timestamps
- `connected_at`, `disconnected_at` — Rastreamento de conexão
- `error_message` (TEXT) — Último erro
- `retry_count` (INTEGER) — Tentativas de reconexão

**Constraints:**
- Status deve ser um dos valores válidos (CHECK constraint)

**Indexes:**
- `idx_sessions_status` — Busca por status
- `idx_sessions_created_at` — Ordenação temporal
- `idx_sessions_label` — Busca por nome

**Trigger:**
- `sessions_updated_at` — Auto-atualiza `updated_at` em UPDATE

**Exemplo de dados:**
```sql
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "label": "Loja A - Vendas",
  "status": "connected",
  "webhook_url": "https://app.example.com/webhook",
  "config": {"autoReply": true},
  "last_seen": "2025-11-13T10:30:00Z"
}
```

---

#### **002_create_messages_table.sql**
Tabela de mensagens para fila e histórico.

**Campos principais:**
- `id` (UUID, PK) — ID interno da mensagem
- `session_id` (UUID, FK) — Referência para sessions
- `message_id` (VARCHAR) — **Idempotency key** do cliente
- `direction` (VARCHAR) — inbound (recebida) ou outbound (enviada)
- `jid` (VARCHAR) — WhatsApp JID (5534999999999@s.whatsapp.net)
- `type` (VARCHAR) — text, image, video, audio, document, etc.
- `payload` (JSONB) — Conteúdo da mensagem
- `status` (VARCHAR) — queued, processing, sent, delivered, read, failed, dlq
- `attempts` (INTEGER) — Número de tentativas
- `max_attempts` (INTEGER) — Limite de tentativas
- `error_message` (TEXT) — Erro da última tentativa
- Timestamps: `created_at`, `queued_at`, `processing_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`
- `wa_message_id` (VARCHAR) — ID retornado pelo WhatsApp
- `wa_timestamp` (BIGINT) — Timestamp do WhatsApp
- `wa_response` (JSONB) — Resposta completa do WhatsApp

**Constraints:**
- `UNIQUE(session_id, message_id)` — **Idempotência garantida**
- Direction, status e type com CHECK constraints

**Indexes:**
- `idx_messages_idempotency` (UNIQUE) — Deduplicação
- `idx_messages_session_id` — Mensagens por sessão
- `idx_messages_status` — Fila de processamento
- `idx_messages_session_status` (composite) — Query comum
- `idx_messages_wa_message_id` — Busca por ID WhatsApp

**Exemplo de dados:**
```sql
{
  "id": "msg-uuid-123",
  "session_id": "session-uuid",
  "message_id": "client-msg-001", // idempotency key
  "direction": "outbound",
  "jid": "5534999999999@s.whatsapp.net",
  "type": "text",
  "payload": {"text": "Olá!"},
  "status": "sent",
  "attempts": 1,
  "sent_at": "2025-11-13T10:35:00Z"
}
```

---

#### **003_create_events_table.sql**
Tabela de auditoria e logs de eventos.

**Campos principais:**
- `id` (UUID, PK)
- `session_id` (UUID, FK, nullable) — Sessão relacionada (ou NULL para eventos globais)
- `event_type` (VARCHAR) — Tipo específico (ex: connection.open, message.sent)
- `event_category` (VARCHAR) — Categoria (connection, message, qr, auth, error, webhook, general)
- `payload` (JSONB) — Dados adicionais do evento
- `severity` (VARCHAR) — debug, info, warn, error, critical
- `created_at` (TIMESTAMP)

**Constraints:**
- Severity e category com CHECK constraints

**Indexes:**
- `idx_events_session_id`
- `idx_events_type`
- `idx_events_category`
- `idx_events_severity`
- `idx_events_created_at`
- `idx_events_session_created` (composite)

**Exemplo de dados:**
```sql
{
  "event_type": "connection.open",
  "event_category": "connection",
  "session_id": "uuid",
  "payload": {"timestamp": "..."},
  "severity": "info"
}
```

---

#### **004_create_migration_history_table.sql**
Tabela para rastrear migrations aplicadas.

**Campos:**
- `id` (SERIAL, PK)
- `migration_name` (VARCHAR, UNIQUE) — Nome do arquivo
- `applied_at` (TIMESTAMP)
- `checksum` (VARCHAR) — SHA-256 hash do conteúdo
- `execution_time_ms` (INTEGER)

**Propósito:**
- Impede re-execução de migrations
- Integridade (checksum verifica alterações)
- Auditoria (tempo de execução)

---

### 2. Sistema de Migrations (`src/db/migrate.js`)

**Features implementadas:**

#### Descoberta automática de migrations
- Lê arquivos `.sql` de `src/db/migrations/`
- Ordena alfabeticamente (001, 002, 003...)

#### Rastreamento de estado
- Cria tabela `migration_history` automaticamente
- Compara migrations aplicadas vs. disponíveis
- Aplica apenas migrations pendentes

#### Integridade e segurança
- Calcula SHA-256 hash de cada migration
- Executa cada migration em transaction (BEGIN/COMMIT/ROLLBACK)
- Registra tempo de execução
- Logs estruturados de progresso

#### Idempotência
- Migrations já aplicadas são ignoradas
- Safe para rodar múltiplas vezes

**Como executar:**
```bash
npm run db:migrate
```

**Output esperado:**
```
[INFO] Starting database migration...
[INFO] Applied migrations loaded (appliedCount: 0)
[INFO] Migration files discovered (totalFiles: 4)
[INFO] Applying migration... (migration: "001_create_sessions_table.sql")
[INFO] Migration applied successfully (migration: "001_create_sessions_table.sql", executionTime: 45)
[INFO] Applying migration... (migration: "002_create_messages_table.sql")
...
[INFO] Migrations completed successfully (appliedCount: 4)
```

---

### 3. Repositories Pattern

Implementamos 3 repositories para acesso a dados com operações CRUD completas.

#### **`src/db/repositories/sessions.js`**

**Funções disponíveis:**

- `createSession(data)` — Criar nova sessão
  ```javascript
  const session = await createSession({
    label: 'Loja A',
    status: 'initializing',
    webhookUrl: 'https://...',
    config: { autoReply: true }
  });
  ```

- `getSessionById(id)` — Buscar por ID
- `getAllSessions(filters)` — Listar todas (com filtros opcionais)
  ```javascript
  const sessions = await getAllSessions({ status: 'connected', limit: 10 });
  ```

- `updateSession(id, data)` — Atualizar campos
  ```javascript
  await updateSession(sessionId, {
    status: 'connected',
    connectedAt: new Date(),
    qrCode: null
  });
  ```

- `deleteSession(id)` — Remover sessão (cascade delete de messages/events)

**Features:**
- Update dinâmico (constrói query apenas com campos fornecidos)
- Auto-log de operações importantes
- Cascade delete configurado no schema

---

#### **`src/db/repositories/messages.js`**

**Funções disponíveis:**

- `createMessage(data)` — Criar mensagem com **idempotência**
  ```javascript
  const message = await createMessage({
    sessionId: 'uuid',
    messageId: 'client-msg-001', // idempotency key
    jid: '5534999999999@s.whatsapp.net',
    type: 'text',
    payload: { text: 'Hello' },
    status: 'queued'
  });
  ```
  - Detecta duplicatas (constraint violation)
  - Retorna mensagem existente se `message_id` duplicado

- `getMessageById(id)` — Buscar por ID interno
- `getMessageByIdempotencyKey(sessionId, messageId)` — Buscar por idempotency key
- `getMessagesBySession(sessionId, filters)` — Mensagens de uma sessão
- `updateMessageStatus(id, status, data)` — Atualizar status
  ```javascript
  await updateMessageStatus(msgId, 'sent', {
    waMessageId: 'wamid.xxx',
    waTimestamp: Date.now()
  });
  ```
  - Auto-seta timestamps (`sent_at`, `delivered_at`, etc.)

- `incrementMessageAttempts(id)` — Incrementar contador de tentativas
- `getQueuedMessages(limit)` — Buscar mensagens na fila

**Features:**
- Idempotência nativa (unique constraint + error handling)
- Auto-timestamps baseados no status
- Suporte a retry logic (attempts tracking)

---

#### **`src/db/repositories/events.js`**

**Funções disponíveis:**

- `createEvent(data)` — Registrar evento
  ```javascript
  await createEvent({
    sessionId: 'uuid',
    eventType: 'connection.open',
    eventCategory: 'connection',
    payload: { timestamp: new Date() },
    severity: 'info'
  });
  ```

- `getEventsBySession(sessionId, filters)` — Eventos de uma sessão
- `getRecentEvents(limit, filters)` — Eventos globais recentes
- `deleteOldEvents(daysToKeep)` — Limpeza de eventos antigos
  ```javascript
  const deleted = await deleteOldEvents(30); // Remove > 30 dias
  ```

**Features:**
- Suporte a eventos globais (sessionId nullable)
- Filtros por categoria e severidade
- Cleanup automático para gerenciar volume

---

### 4. Seeds (`src/db/seed.js`)

**Dados de teste criados:**

#### 3 Sessions
1. "Test Session 1 - Connected" (status: connected)
2. "Test Session 2 - QR Pending" (status: qr_pending)
3. "Test Session 3 - Disconnected" (status: disconnected)

#### 3 Messages
- 1 outbound text (sent)
- 1 inbound text (delivered)
- 1 outbound image (queued)

#### 4 Events
- connection.open
- qr.generated
- connection.close
- message.sent

**Como executar:**
```bash
npm run db:seed
```

**Idempotência:**
- Seeds podem ser executados múltiplas vezes
- Usa `ON CONFLICT DO NOTHING` para sessions

---

## 📊 Schema Visual

```
┌─────────────────────────────────────────────────────────────┐
│                         SESSIONS                            │
├─────────────────────────────────────────────────────────────┤
│ id (UUID, PK)                                               │
│ label (VARCHAR)                                             │
│ status (VARCHAR) → CHECK constraint                         │
│ webhook_url (TEXT)                                          │
│ config (JSONB)                                              │
│ qr_code, last_qr_at                                         │
│ created_at, updated_at, last_seen                           │
│ connected_at, disconnected_at                               │
│ error_message, retry_count                                  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ FK (session_id)
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼──────────────────┐          ┌────────▼────────────┐
│      MESSAGES            │          │      EVENTS         │
├──────────────────────────┤          ├─────────────────────┤
│ id (UUID, PK)            │          │ id (UUID, PK)       │
│ session_id (FK)          │          │ session_id (FK)     │
│ message_id (idempotency) │          │ event_type          │
│ direction, jid, type     │          │ event_category      │
│ payload (JSONB)          │          │ payload (JSONB)     │
│ status, attempts         │          │ severity            │
│ timestamps (7x)          │          │ created_at          │
│ wa_message_id            │          └─────────────────────┘
└──────────────────────────┘
  UNIQUE(session_id, message_id)
```

---

## ✅ Validação

### 1. Verificar migrations criadas
```bash
ls -la src/db/migrations/
# Deve listar 4 arquivos .sql
```

### 2. Executar migrations (requer Postgres rodando)
```bash
# Criar database
psql -U postgres -c "CREATE DATABASE zaphub;"

# Executar migrations
npm run db:migrate
```

**Output esperado:**
```
[INFO] Starting database migration...
[INFO] Migrations completed successfully (appliedCount: 4)
```

### 3. Verificar tabelas criadas
```bash
psql -U postgres -d zaphub -c "\dt"
```

**Output esperado:**
```
          List of relations
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+-------
 public | events            | table | ...
 public | messages          | table | ...
 public | migration_history | table | ...
 public | sessions          | table | ...
```

### 4. Executar seeds
```bash
npm run db:seed
```

**Output esperado:**
```
[INFO] Starting database seeding...
[INFO] Sessions seeded (count: 3)
[INFO] Messages seeded (count: 3)
[INFO] Events seeded (count: 4)
[INFO] Database seeding completed successfully
```

### 5. Testar repositories
```javascript
// Criar arquivo test.js temporário
import { createSession, getAllSessions } from './src/db/repositories/index.js';

const session = await createSession({ label: 'Test', status: 'initializing' });
console.log('Created:', session);

const all = await getAllSessions();
console.log('All sessions:', all.length);
```

```bash
node test.js
```

---

## 📊 Métricas de Progresso

- ✅ Migrations SQL (4 arquivos): 100%
- ✅ Sistema de migrations (migrate.js): 100%
- ✅ Repositories (sessions, messages, events): 100%
- ✅ Seeds básicos: 100%
- ✅ Indexes e constraints: 100%
- ✅ Documentação: 100%

**Status Geral da Etapa 2:** ✅ **100% Concluída**

---

## 🚀 Próximos Passos (Etapa 3)

A **Etapa 3 — Redis & BullMQ: Setup de Filas** incluirá:

1. Configurar cliente Redis (já parcialmente feito em Etapa 1)
2. Definir filas específicas:
   - `session:init` — Inicializar sessões
   - `session:{id}:send` — Enviar mensagens por sessão
   - `session:receive` — Processar mensagens recebidas
3. Configurar políticas de retry e DLQ
4. Criar eventos de fila (completed, failed, stalled)
5. Implementar monitoramento de filas
6. Documentar em `docs/baileys/etapa-03-queues.md`

---

## 📝 Notas Técnicas

### Decisões de Design

1. **UUID como PK** — Seguro, distribuído, não sequencial (melhor para APIs públicas)
2. **JSONB para config/payload** — Flexibilidade sem precisar alterar schema
3. **Idempotência via UNIQUE constraint** — Garante no nível do DB (não depende de aplicação)
4. **Cascade DELETE** — Limpeza automática de mensagens/eventos ao deletar sessão
5. **Timestamps múltiplos** — Rastreamento completo do ciclo de vida da mensagem
6. **CHECK constraints** — Validação no DB (camada extra de segurança)
7. **Indexes estratégicos** — Performance para queries comuns (by session, by status)
8. **Auto-update de updated_at** — Trigger garante consistência

### Idempotência

A implementação garante que:
- Cliente pode reenviar a mesma mensagem (mesmo `messageId`)
- DB detecta duplicata (unique constraint)
- Repository retorna mensagem existente
- Processamento não duplica

**Exemplo:**
```javascript
// Primeira chamada
const msg1 = await createMessage({ sessionId: 'x', messageId: 'msg-001', ... });
// msg1.id = uuid-aaa

// Segunda chamada (mesmo messageId)
const msg2 = await createMessage({ sessionId: 'x', messageId: 'msg-001', ... });
// msg2.id = uuid-aaa (mesmo objeto, não cria novo)
```

### Performance

**Queries otimizadas:**
- `idx_messages_session_status` (composite) — usado em `SELECT * FROM messages WHERE session_id = ? AND status = ?`
- `idx_messages_idempotency` (unique) — lookup rápido para deduplicação
- `idx_events_session_created` (composite) — timeline de eventos por sessão

**Cleanup automático:**
- `removeOnComplete` e `removeOnFail` em BullMQ jobs (config na Etapa 1)
- `deleteOldEvents()` function para limpar eventos antigos

### Segurança

- Cascade DELETE protege integridade referencial
- CHECK constraints evitam dados inválidos
- Transactions garantem atomicidade
- Migrations versionadas impedem inconsistências

---

## 🐛 Troubleshooting

### Erro: `database "zaphub" does not exist`
```bash
psql -U postgres -c "CREATE DATABASE zaphub;"
```

### Erro: `relation "sessions" already exists`
- Normal se migrations já foram aplicadas
- Sistema de migrations detecta e pula

### Erro: `duplicate key value violates unique constraint`
- Isso é idempotência funcionando!
- Repository retorna objeto existente

### Seeds retornam IDs diferentes a cada execução
- Normal, UUIDs são gerados aleatoriamente
- Para IDs fixos, edite seed.js e use UUIDs hardcoded

### Migrations muito lentas
- Verificar recursos do Postgres
- Indexes são criados de forma sequencial (pode demorar em tabelas grandes)
- Normal para primeira execução

---

## 📚 Referências

- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)
- [UUID Best Practices](https://www.postgresql.org/docs/current/datatype-uuid.html)
- [Idempotency Patterns](https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-unnecessary-json-jsonb/)
- [Database Migrations Best Practices](https://www.postgresql.org/docs/current/ddl-alter.html)

---

**Conclusão:** A camada de persistência do ZapHub está completa com schema robusto, migrations versionadas, repositories pattern e dados de teste. Pronto para integrar com Redis/BullMQ (Etapa 3) e Connection Manager (Etapa 4).
