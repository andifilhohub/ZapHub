# Etapa 9 - Testes Automatizados

## 📋 Sumário Executivo

Esta etapa implementa uma suite completa de testes automatizados para o **ZapHub**, cobrindo testes unitários, de integração e end-to-end (E2E). O objetivo é garantir qualidade de código, prevenir regressões e facilitar refatorações futuras.

**Status**: 🚧 Em andamento (30% completo)  
**Prioridade**: Alta  
**Estimativa de conclusão**: 2-3 dias  

---

## 🎯 Objetivos

1. ✅ Configurar ambiente de testes (Jest + Supertest)
2. ✅ Criar banco de dados de teste isolado
3. ✅ Implementar testes unitários para repositories
4. ⏳ Implementar testes de integração para API REST
5. ⏳ Implementar testes E2E para workers
6. ⏳ Configurar coverage reports (target: 80%+)
7. ⏳ Setup CI/CD com GitHub Actions

---

## 🛠️ Stack de Testes

### Ferramentas Instaladas

```json
{
  "jest": "^29.7.0",                    // Test runner
  "supertest": "^7.1.4",                // HTTP assertions
  "@jest/globals": "^30.2.0",           // Jest ESM support
  "@types/jest": "^30.0.0"              // TypeScript types
}
```

### Configuração

**jest.config.js**:
- Ambiente: Node.js
- Suporte a ESM (type: module)
- Coverage threshold: 75% lines, 70% branches/functions
- Timeout: 30s (para testes de integração)
- Auto-cleanup de mocks entre testes

**.env.test**:
- Banco de dados: `zaphub_test` (isolado do desenvolvimento)
- Redis DB: 1 (separado do dev)
- API_KEY: `test-api-key-12345`
- Concurrency reduzida nos workers (2-5)

---

## 📁 Estrutura de Testes

```
tests/
├── setup.js                           # Global test setup
├── unit/                              # Testes unitários (sem I/O externo)
│   ├── sessions.repository.test.js    # ✅ 9/13 testes passando
│   └── messages.repository.test.js    # ⏳ Aguardando correções
└── integration/                       # Testes de integração (com DB/API)
    ├── sessions.api.test.js           # ✅ Criado, aguardando execução
    ├── messages.api.test.js           # ⏳ A criar
    └── webhooks.api.test.js           # ⏳ A criar
```

---

## ✅ Implementações Concluídas

### 1. Setup de Ambiente de Testes

**Arquivos criados**:
- `jest.config.js` - Configuração do Jest com ESM
- `.env.test` - Variáveis de ambiente para testes
- `tests/setup.js` - Utilities globais de teste

**Utilities globais**:
```javascript
global.testUtils = {
  randomSessionId: () => `test-session-${Date.now()}-${random}`,
  randomMessageId: () => `test-msg-${Date.now()}-${random}`,
  randomPhone: () => `55119${Math.floor(1e8 + Math.random() * 9e8)}@s.whatsapp.net`,
  sleep: (ms) => Promise,
  waitFor: (condition, timeout, interval) => Promise
};
```

### 2. Scripts NPM

```json
{
  "test": "NODE_ENV=test node --experimental-vm-modules node_modules/jest/bin/jest.js",
  "test:unit": "npm run test -- tests/unit",
  "test:integration": "npm run test -- tests/integration",
  "test:watch": "npm run test -- --watch",
  "test:coverage": "npm run test -- --coverage",
  "test:db:create": "node src/db/createTestDb.js",
  "test:db:migrate": "node src/db/migrateTest.js",
  "test:db:reset": "node src/db/resetTestDb.js && npm run test:db:migrate",
  "test:setup": "npm run test:db:reset"
}
```

### 3. Banco de Dados de Teste

**Scripts criados**:
- `src/db/createTestDb.js` - Cria banco `zaphub_test`
- `src/db/migrateTest.js` - Roda migrations no banco de teste
- `src/db/resetTestDb.js` - Drop + create + migrate

**Processo de setup**:
```bash
npm run test:setup
# ✓ Terminated existing connections
# ✓ Dropped database: zaphub_test
# ✓ Created database: zaphub_test
# ✓ Ran 4 migrations successfully
```

### 4. Melhorias no DB Client

**Adicionado em src/db/client.js**:
```javascript
export async function query(...args) {
  const dbPool = getDbPool();
  return dbPool.query(...args);
}

export async function getClient() {
  const dbPool = getDbPool();
  return dbPool.connect();
}
```

Agora os testes podem usar:
```javascript
import { query, closeDb } from '../../src/db/client.js';

await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
await closeDb(); // No afterAll hook
```

---

## 📊 Resultados Atuais

### Testes Unitários - Sessions Repository

**Arquivo**: `tests/unit/sessions.repository.test.js`  
**Status**: ✅ 9/13 testes passando (69% sucesso)

#### ✅ Testes Passando (9)

1. **createSession()**
   - ✅ should create a new session successfully
   - ✅ should create session with custom status
   - ✅ should create session with config

2. **getSessionById()**
   - ✅ should find session by ID
   - ✅ should return null for non-existent session

3. **getAllSessions()**
   - ✅ should list all sessions
   - ✅ should filter by status
   - ✅ should limit results

4. **updateSession()**
   - ✅ should update session successfully

#### ❌ Testes Falhando (4)

- ❌ updateSession() - should update webhook URL (syntax error no repo)
- ❌ updateSession() - should return null for non-existent session
- ❌ deleteSession() - should delete session successfully
- ❌ deleteSession() - should return null for non-existent session

**Motivo**: Pequenos bugs no repository (updateSession tratando webhookUrl como campo inválido)

---

### Testes de Integração - Sessions API

**Arquivo**: `tests/integration/sessions.api.test.js`  
**Status**: ✅ Criado (não executado ainda)

**Casos de teste (37 total)**:

1. **POST /api/v1/sessions**
   - Create session with valid data
   - Reject without API key
   - Reject with invalid API key
   - Accept API key via query parameter
   - Reject invalid webhook URL
   - Create session with metadata

2. **GET /api/v1/sessions**
   - List all sessions
   - Filter by status
   - Paginate results
   - Reject invalid limit

3. **GET /api/v1/sessions/:id**
   - Get session by ID
   - Return 404 for non-existent session

4. **PATCH /api/v1/sessions/:id**
   - Update session label
   - Update webhook URL
   - Reject invalid webhook URL
   - Return 404 for non-existent session

5. **DELETE /api/v1/sessions/:id**
   - Delete session
   - Return 404 for non-existent session

6. **GET /api/v1/sessions/:id/qr**
   - Return QR code if available
   - Return 404 if QR not available

7. **GET /api/v1/sessions/:id/status**
   - Return session status
   - Return 404 for non-existent session

8. **GET /api/v1/health**
   - Return healthy status
   - Should not require authentication

---

## 📈 Coverage Report

**Coverage atual** (parcial - apenas sessions repository):

```
File                      | % Stmts | % Branch | % Funcs | % Lines
--------------------------|---------|----------|---------|--------
All files                 |    4.84 |     5.22 |    5.18 |    4.92
db/repositories/sessions.js|   76.19 |    69.44 |     100 |   76.19
```

**Target de coverage**:
- Statements: 75%
- Branches: 70%
- Functions: 70%
- Lines: 75%

**Nota**: Coverage global está baixo (4.84%) porque a maioria dos arquivos ainda não está sendo testada.

---

## ⏳ Próximos Passos

### 1. Corrigir testes falhando (Priority: HIGH)

- [ ] Investigar bug em `updateSession()` com `webhookUrl`
- [ ] Corrigir `deleteSession()` para retornar corretamente
- [ ] Validar todos os 13 testes do sessions repository

### 2. Completar testes unitários de repositories

**Messages Repository**:
- [ ] create() - outbound/inbound messages, metadata
- [ ] findById() - find e null
- [ ] findBySessionId() - filtros (direction, status, type)
- [ ] updateStatus() - sent, delivered, read, failed
- [ ] findByWaMessageId() - idempotência
- [ ] countBySessionId() - count com filtros

**Events Repository**:
- [ ] create() - criar eventos
- [ ] findBySessionId() - listar eventos
- [ ] findBySessionId() - filtros (eventCategory, eventType, severity)
- [ ] cleanup() - deletar eventos antigos

### 3. Executar testes de integração da API

```bash
npm run test:integration -- --testNamePattern="Sessions API"
```

**Expected results**: 37 testes, todos passando

### 4. Criar testes de integração para Messages API

**Arquivo**: `tests/integration/messages.api.test.js`

**Casos de teste (30+)**:
- POST /messages - 9 tipos de mensagem (text, image, video, audio, document, location, contact, reaction, template)
- POST /messages - idempotência (mesmo messageId = 200 OK sem duplicar)
- POST /messages - validação de campos obrigatórios
- GET /messages - listar com filtros (status, direction, message_type)
- GET /messages/:id - detalhes da mensagem

### 5. Criar testes de integração para Webhooks API

**Arquivo**: `tests/integration/webhooks.api.test.js`

**Casos de teste**:
- POST /webhook/test - testar URL válida
- POST /webhook/test - timeout em URL lenta
- POST /webhook/test - erro em URL inválida
- GET /webhook/events - listar histórico
- GET /webhook/events - filtrar por status (delivered/failed)
- POST /webhook/retry - retry manual de webhook falhado
- GET /webhook/events (global) - listar tipos de eventos

### 6. Testes E2E de Workers (com mocks)

**Arquivo**: `tests/e2e/workers.test.js`

**Estratégia**:
- Mock do Baileys socket
- Mock de webhook delivery (fetch)
- Testar fluxo completo: enqueue → worker → process → callback

**Casos de teste**:
- sessionInitWorker - inicializa sessão, conecta, emite QR
- messageSendWorker - processa fila, envia mensagem, atualiza status
- messageReceiveWorker - recebe mensagem, salva no DB, envia webhook
- webhookWorker - entrega webhook, retry em caso de falha

### 7. Load Testing com k6

**Arquivo**: `tests/load/load-test.js` (k6 script)

**Cenários**:
- Ramping: 0 → 100 virtual users em 1min
- Sustained: 100 VUs por 5min
- Spike: 0 → 500 VUs em 10s

**Métricas**:
- Requests/s (target: 1000+)
- Latência P95 (target: <500ms)
- Error rate (target: <1%)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '5m', target: 100 },   // Sustained
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% < 500ms
    http_req_failed: ['rate<0.01'],    // < 1% errors
  },
};

export default function () {
  const res = http.post(
    'http://localhost:3000/api/v1/sessions',
    JSON.stringify({ label: 'Load Test Session' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key-12345'
      }
    }
  );
  
  check(res, {
    'status is 201': (r) => r.status === 201,
    'has session id': (r) => r.json().id !== undefined,
  });
  
  sleep(1);
}
```

### 8. CI/CD com GitHub Actions

**Arquivo**: `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14-alpine
        env:
          POSTGRES_PASSWORD: postgresql
          POSTGRES_DB: zaphub_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup test database
        run: npm run test:setup
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Generate coverage report
        run: npm run test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          fail_ci_if_error: true
```

---

## 🔧 Comandos Úteis

```bash
# Setup inicial (uma vez)
npm run test:setup

# Rodar todos os testes
npm test

# Rodar apenas testes unitários
npm run test:unit

# Rodar apenas testes de integração
npm run test:integration

# Rodar testes em watch mode (desenvolvimento)
npm run test:watch

# Gerar coverage report
npm run test:coverage

# Rodar teste específico
npm test -- --testNamePattern="Sessions Repository"

# Rodar arquivo específico
npm test tests/unit/sessions.repository.test.js

# Reset do banco de teste
npm run test:db:reset

# Visualizar coverage HTML
open coverage/lcov-report/index.html
```

---

## 📝 Boas Práticas Adotadas

### 1. Isolamento de Ambiente

- ✅ Banco de dados separado (`zaphub_test`)
- ✅ Redis DB separado (DB 1 ao invés de 0)
- ✅ API_KEY específica para testes
- ✅ Logs suprimidos (LOG_LEVEL=error)

### 2. Cleanup Automático

```javascript
afterAll(async () => {
  // Limpar dados de teste
  await query('DELETE FROM sessions WHERE label LIKE $1', ['%Test%']);
  // Fechar conexões
  await closeDb();
});
```

### 3. Test Data Factories

```javascript
const testSessionId = global.testUtils.randomSessionId();
const testPhone = global.testUtils.randomPhone();
```

Evita conflitos entre testes paralelos

### 4. Assertions Detalhadas

```javascript
test('should create session successfully', async () => {
  const session = await createSession({ label: 'Test' });
  
  expect(session).toBeDefined();
  expect(session.id).toBeDefined();
  expect(session.label).toBe('Test');
  expect(session.status).toBe('initializing');
  expect(session.created_at).toBeDefined();
});
```

### 5. Testes Independentes

- Cada teste cria seus próprios dados
- Não depende de estado de outros testes
- Pode rodar em qualquer ordem

---

## 🐛 Issues Conhecidos

### 1. ESM + Jest + Experimental Warning

```
(node:15706) ExperimentalWarning: VM Modules is an experimental feature
```

**Status**: Esperado, não impacta testes  
**Solução**: Aguardar Jest 30 com suporte nativo a ESM

### 2. Coverage Threshold Failing

```
Jest: "global" coverage threshold for lines (75%) not met: 4.84%
```

**Status**: Normal nesta fase  
**Motivo**: Maioria dos arquivos não está sendo testada ainda  
**Solução**: Implementar testes restantes

### 3. Repository Method Names

Repositories usam nomes como `createSession` ao invés de `create`.  
**Decisão**: Manter nomes atuais, adaptar testes.

---

## 📊 Métricas de Progresso

### Testes Implementados

| Categoria        | Arquivos | Testes | Passando | Falhando | % Sucesso |
|------------------|----------|--------|----------|----------|-----------|
| Unit - Repos     | 1        | 13     | 9        | 4        | 69%       |
| Integration - API| 1        | 37     | 0        | 0        | N/A       |
| E2E - Workers    | 0        | 0      | 0        | 0        | N/A       |
| Load Testing     | 0        | 0      | 0        | 0        | N/A       |
| **Total**        | **2**    | **50** | **9**    | **4**    | **18%**   |

### Arquivos de Teste

- ✅ `tests/setup.js` - Global setup
- ✅ `tests/unit/sessions.repository.test.js` - 200 linhas
- ✅ `tests/unit/messages.repository.test.js` - 300 linhas (criado, não rodado)
- ✅ `tests/integration/sessions.api.test.js` - 400 linhas (criado, não rodado)
- ⏳ `tests/integration/messages.api.test.js` - A criar
- ⏳ `tests/integration/webhooks.api.test.js` - A criar
- ⏳ `tests/e2e/workers.test.js` - A criar
- ⏳ `tests/load/load-test.js` - A criar (k6)

### Scripts de DB

- ✅ `src/db/createTestDb.js` - 60 linhas
- ✅ `src/db/migrateTest.js` - 60 linhas
- ✅ `src/db/resetTestDb.js` - 60 linhas

**Total de código de teste**: ~1.180 linhas (e crescendo)

---

## 🎯 Metas de Conclusão

### Curto Prazo (1-2 dias)

- [ ] Corrigir 4 testes falhando em sessions repository
- [ ] Executar testes de integração de sessions API (37 testes)
- [ ] Criar e executar testes de messages repository (20+ testes)
- [ ] Criar e executar testes de messages API (30+ testes)
- [ ] Atingir **40% de coverage global**

### Médio Prazo (3-5 dias)

- [ ] Criar testes de webhooks API (15+ testes)
- [ ] Criar testes de events repository (10+ testes)
- [ ] Implementar testes E2E de workers com mocks (20+ testes)
- [ ] Atingir **70% de coverage global**

### Longo Prazo (1-2 semanas)

- [ ] Load testing com k6 (cenários de stress)
- [ ] Configurar CI/CD com GitHub Actions
- [ ] Badges de coverage (Codecov)
- [ ] Documentação completa de testes
- [ ] Atingir **80%+ de coverage global**

---

## 📚 Referências

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest GitHub](https://github.com/ladjs/supertest)
- [k6 Load Testing](https://k6.io/docs/)
- [GitHub Actions for Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs)
- [Codecov Integration](https://docs.codecov.com/docs)

---

**Última Atualização**: 2025-11-13  
**Autor**: Anderson (via GitHub Copilot)  
**Progresso**: 18% (9/50 testes passando)  
**Próximo Milestone**: 40% coverage + 100 testes passando
