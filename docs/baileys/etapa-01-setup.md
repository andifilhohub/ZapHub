# Etapa 1 — Setup: Estrutura de Pastas e Configuração Base

**Data:** 2025-11-13  
**Status:** ✅ Concluída  
**Responsável:** Desenvolvimento inicial

---

## 📋 Objetivo da Etapa

Criar a fundação do projeto ZapHub, estabelecendo:
- Estrutura de pastas organizada e escalável
- Arquivos de configuração centralizados
- Clientes para recursos externos (DB, Redis, Logger)
- Dependências necessárias instaladas
- Scripts de desenvolvimento e produção

---

## 🎯 O Que Foi Realizado

### 1. Estrutura de Pastas Criada

```
zaphub/
├── config/                  # ✅ Configurações centralizadas
│   └── index.js            # Centralizador de env vars
├── src/
│   ├── core/               # ✅ Para Connection Manager (próxima etapa)
│   ├── db/                 # ✅ Database
│   │   ├── client.js       # Cliente Postgres (pool)
│   │   ├── migrations/     # SQL migrations (próxima etapa)
│   │   └── seeds/          # Dados iniciais (próxima etapa)
│   ├── lib/                # ✅ Bibliotecas compartilhadas
│   │   ├── logger.js       # Logger estruturado (pino)
│   │   ├── queue.js        # Abstração BullMQ
│   │   └── redis.js        # Cliente Redis (ioredis)
│   ├── utils/              # ✅ Utilitários
│   │   ├── errors.js       # Classes de erro customizadas
│   │   └── validators.js   # Validação com Joi
│   └── workers/            # ✅ Para workers de fila (próxima etapa)
├── .env.example            # ✅ Template de variáveis
├── .gitignore              # ✅ Ignorar node_modules, .env, auth_data
├── README.md               # ✅ Documentação principal
└── package.json            # ✅ Atualizado com deps e scripts
```

### 2. Arquivos de Configuração

#### `.env.example`
Template completo de variáveis de ambiente:
- Server (PORT, LOG_LEVEL)
- Database (Postgres connection)
- Redis (host, port, password)
- BullMQ (concurrency, retry policy)
- Baileys (auth_data dir, timeout)
- Security (API keys, JWT)
- Webhooks (timeout, retry)
- Observability (metrics port)

#### `config/index.js`
Centralizador que lê `.env` e exporta objeto de configuração estruturado:
```javascript
import dotenv from 'dotenv';
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  server: { port, logLevel },
  db: { host, port, database, user, password, pool },
  redis: { host, port, password, db },
  queue: { concurrency, maxAttempts, backoffDelay },
  baileys: { authDataDir, sessionTimeout },
  security: { apiKeyEnabled, apiKey, jwtSecret },
  webhook: { timeout, retryAttempts },
  metrics: { enabled, port },
};

export default config;
```

**Vantagens:**
- Centralização de configuração
- Type-safe (parseInt para números)
- Fácil de testar e mockar
- Suporte a múltiplos ambientes (dev/prod)

### 3. Clientes e Bibliotecas

#### `src/lib/logger.js`
Logger estruturado usando **pino**:
- Logs em JSON (fácil parsing)
- Desenvolvimento: `pino-pretty` para colorização
- Produção: JSON puro para aggregators
- Níveis: trace, debug, info, warn, error, fatal

Exemplo de uso:
```javascript
import logger from './lib/logger.js';
logger.info({ userId: 123 }, 'User logged in');
logger.error({ err }, 'Database connection failed');
```

#### `src/lib/redis.js`
Cliente Redis usando **ioredis**:
- Singleton pattern (getRedisClient)
- Retry automático com backoff
- Event handlers (connect, error, close)
- Método graceful shutdown (closeRedis)
- `maxRetriesPerRequest: null` (requerido pelo BullMQ)

Exemplo:
```javascript
import { getRedisClient } from './lib/redis.js';
const redis = getRedisClient();
await redis.set('key', 'value');
```

#### `src/db/client.js`
Cliente Postgres usando **pg** (Pool):
- Pool de conexões configurável (min/max)
- Event handlers (connect, error)
- Método graceful shutdown (closeDb)

Exemplo:
```javascript
import { getDbPool } from './db/client.js';
const pool = getDbPool();
const result = await pool.query('SELECT * FROM sessions');
```

#### `src/lib/queue.js`
Abstração de filas usando **BullMQ**:
- `getQueue(name)` — cria ou retorna fila existente
- `createWorker(name, processor)` — cria worker para processar jobs
- Configuração padrão de retry (exponential backoff)
- Auto-cleanup de jobs completados/falhados
- Event handlers para completed/failed/error
- Método `closeQueues()` para graceful shutdown

Exemplo:
```javascript
import { getQueue, createWorker } from './lib/queue.js';

// Adicionar job
const queue = getQueue('session:send');
await queue.add('send-message', { sessionId: '123', to: 'xxx', message: 'Hi' });

// Processar jobs
createWorker('session:send', async (job) => {
  const { sessionId, to, message } = job.data;
  // processar...
});
```

### 4. Utilitários

#### `src/utils/errors.js`
Classes de erro customizadas:
- `AppError` — base class (statusCode, isOperational)
- `ValidationError` — 400 (com details array)
- `NotFoundError` — 404
- `ConflictError` — 409
- `UnauthorizedError` — 401
- `SessionError` — erro relacionado a sessões

Uso:
```javascript
throw new NotFoundError('Session');
throw new ValidationError('Invalid input', [{ field: 'to', message: 'Required' }]);
```

#### `src/utils/validators.js`
Validação com **Joi**:
- Helper `validate(data, schema)` — lança ValidationError se inválido
- Schemas comuns (uuid, jid, messageType)

Exemplo:
```javascript
import { validate } from './utils/validators.js';
import Joi from 'joi';

const schema = Joi.object({
  to: Joi.string().required(),
  message: Joi.string().required(),
});

const validated = validate(req.body, schema); // throws ValidationError se inválido
```

### 5. Dependências Instaladas

#### Produção
- `pg` (^8.13.1) — PostgreSQL client
- `ioredis` (^5.4.2) — Redis client
- `bullmq` (^5.34.3) — Filas e workers
- `dotenv` (^16.4.7) — Variáveis de ambiente
- `joi` (^17.13.3) — Validação de schemas
- `pino` (^10.1.0) — Logger estruturado
- `pino-pretty` (^13.0.0) — Pretty print para dev
- `prom-client` (^15.1.3) — Métricas Prometheus
- `qrcode` (^1.5.4) — Geração de QR code
- `uuid` (^11.0.4) — Geração de IDs únicos
- (mantidas) `@whiskeysockets/baileys`, `express`, `cors`, etc.

#### Desenvolvimento
- `nodemon` (^3.1.9) — Hot reload
- `eslint` (^9.17.0) — Linting
- `prettier` (^3.4.2) — Formatação
- `jest` (^29.7.0) — Testes

### 6. Scripts Atualizados

`package.json`:
```json
{
  "scripts": {
    "start": "node src/server/app.js",
    "dev": "nodemon src/server/app.js",
    "worker": "node src/workers/index.js",
    "db:migrate": "node src/db/migrate.js",
    "db:seed": "node src/db/seed.js",
    "test": "NODE_ENV=test jest",
    "test:watch": "npm run test -- --watch",
    "test:coverage": "npm run test -- --coverage",
    "lint": "eslint src/",
    "format": "prettier --write \"src/**/*.js\""
  }
}
```

---

## 🔄 Integração com Código Existente

### Mantido (sem alterações)
- `src/connections/baileys/index.js` — código original do Baileys
- `src/routes/routes.js` — rotas existentes
- `src/server/app.js` — Express server (será atualizado em próximas etapas)
- `public/send.html` — frontend de testes

### Novo
- Toda a infraestrutura de config, logging, DB, Redis, filas

---

## ✅ Validação

Para validar que tudo foi criado corretamente:

### 1. Verificar estrutura de pastas
```bash
ls -la config/ src/lib/ src/db/ src/core/ src/workers/ src/utils/
```

### 2. Verificar arquivos de configuração
```bash
cat .env.example
cat config/index.js
```

### 3. Instalar dependências
```bash
npm install
```

### 4. Testar imports (criar arquivo de teste temporário)
```bash
node -e "import('./config/index.js').then(c => console.log('Config OK:', c.default.server.port))"
node -e "import('./src/lib/logger.js').then(l => l.default.info('Logger OK'))"
```

---

## 📊 Métricas de Progresso

- ✅ Estrutura de pastas: 100%
- ✅ Configuração (.env, config/): 100%
- ✅ Clientes (DB, Redis, Logger): 100%
- ✅ Utilitários (errors, validators): 100%
- ✅ Abstração de filas (BullMQ): 100%
- ✅ Dependências instaladas: 100%
- ✅ Scripts npm atualizados: 100%
- ✅ Documentação (README, .gitignore): 100%

**Status Geral da Etapa 1:** ✅ **100% Concluída**

---

## 🚀 Próximos Passos (Etapa 2)

A **Etapa 2 — Database: Schema e Migrations** incluirá:

1. Criar migrations SQL para tabelas:
   - `sessions` (id, label, status, webhook_url, config, created_at, updated_at, last_seen)
   - `messages` (id, session_id, message_id, to, type, payload, status, attempts, error, created_at, processed_at)
   - `events` (id, session_id, event_type, payload, created_at)

2. Implementar script `src/db/migrate.js` para executar migrations

3. Criar seeds básicos para testes (`src/db/seeds/`)

4. Documentar em `docs/baileys/etapa-02-database.md`

---

## 📝 Notas Técnicas

### Decisões de Design

1. **Config centralizado** — facilita testes e múltiplos ambientes
2. **Singleton pattern** para clients (Redis, DB) — evita múltiplas conexões
3. **Graceful shutdown** — métodos `close*()` para cleanup em SIGTERM
4. **Logs estruturados** — JSON para facilitar parsing e agregação
5. **Validação com Joi** — schemas reutilizáveis e mensagens claras
6. **BullMQ abstraction** — isola lógica de filas, facilita testes

### Segurança

- `.env` no `.gitignore` (nunca commitar secrets)
- API keys e JWT secrets configuráveis
- Pool de conexões com limites (evita resource exhaustion)

### Performance

- Pool de conexões DB (reuso)
- Redis connection reuse
- BullMQ concurrency configurável
- Job cleanup automático (removeOnComplete/removeOnFail)

---

## 🐛 Troubleshooting

### Erro: `Cannot find module 'dotenv'`
```bash
npm install
```

### Erro: Redis connection refused
```bash
# Verificar se Redis está rodando
redis-cli ping
# ou
docker run -d -p 6379:6379 redis:alpine
```

### Erro: Postgres connection refused
```bash
# Criar database
psql -U postgres
CREATE DATABASE zaphub;
\q
```

### Logs não aparecem coloridos
```bash
# Instalar pino-pretty
npm install pino-pretty --save-dev
# Verificar NODE_ENV (deve ser development)
```

---

## 📚 Referências

- [Pino Logger](https://getpino.io/)
- [BullMQ Docs](https://docs.bullmq.io/)
- [ioredis](https://github.com/redis/ioredis)
- [node-postgres](https://node-postgres.com/)
- [Joi Validation](https://joi.dev/)
- [dotenv](https://github.com/motdotla/dotenv)

---

**Conclusão:** A infraestrutura base do ZapHub está completa e pronta para receber a implementação de persistência (Etapa 2), Connection Manager (Etapa 4) e APIs (Etapas 5-6).
