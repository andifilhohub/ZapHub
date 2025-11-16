# 📊 Guia de Escalabilidade - ZapHub

## ✅ Arquitetura Multi-Tenancy

O ZapHub foi projetado para suportar **múltiplos clientes** em uma única instalação:

### 🔒 Isolamento por Cliente

```
auth_data/
├── cliente-uuid-1/     ← Sessão do Cliente 1
│   ├── creds.json
│   ├── app-state-sync-key-*.json
│   └── pre-key-*.json
├── cliente-uuid-2/     ← Sessão do Cliente 2
│   ├── creds.json
│   └── ...
└── cliente-uuid-N/     ← Sessão do Cliente N
    └── ...
```

Cada cliente tem:
- ✅ **Auth data isolado** (pasta própria)
- ✅ **WebSocket próprio** (Map<sessionId, socket>)
- ✅ **Registro no banco** (UUID único)
- ✅ **Fila de mensagens** separada

---

## 📈 Tiers de Escalabilidade

### 🏢 Tier 1: Pequeno Porte (1-50 clientes)

**Hardware Recomendado:**
- **CPU**: 2-4 cores
- **RAM**: 4-8GB
- **Disco**: 20GB SSD
- **Rede**: 100Mbps

**Configuração (.env):**
```env
NODE_ENV=production
MAX_CONCURRENT_SESSIONS=50
DB_POOL_MAX=20
QUEUE_CONCURRENCY=10
```

**Custos Estimados (VPS):**
- AWS t3.medium: ~$30/mês
- DigitalOcean: ~$24/mês
- Hetzner: ~€10/mês

---

### 🏭 Tier 2: Médio Porte (50-200 clientes)

**Hardware Recomendado:**
- **CPU**: 4-8 cores
- **RAM**: 16-32GB
- **Disco**: 100GB SSD NVMe
- **Rede**: 1Gbps

**Configuração (.env):**
```env
NODE_ENV=production
MAX_CONCURRENT_SESSIONS=200
DB_POOL_MAX=50
DB_POOL_MIN=10
QUEUE_CONCURRENCY=20
REDIS_POOL_MAX=20
```

**Otimizações:**
```bash
# Aumentar file descriptors
ulimit -n 65536

# PostgreSQL tuning
shared_buffers = 4GB
effective_cache_size = 12GB
max_connections = 200
```

**Custos Estimados:**
- AWS c6i.2xlarge: ~$200/mês
- DigitalOcean Premium: ~$160/mês

---

### 🏗️ Tier 3: Grande Porte (200-1000+ clientes)

**Arquitetura: Horizontal Scaling**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (NGINX/HAProxy)│
                    └─────────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
         │ API +   │    │ API +   │    │ API +   │
         │ Worker 1│    │ Worker 2│    │ Worker N│
         └────┬────┘    └────┬────┘    └────┬────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
           ┌────▼─────┐              ┌──────▼──────┐
           │PostgreSQL│              │   Redis     │
           │(Primary) │              │  (Cluster)  │
           └──────────┘              └─────────────┘
```

**Requisitos por Instância:**
- **CPU**: 8 cores
- **RAM**: 32GB
- **Disco**: 200GB SSD
- **Sessões por instância**: 200-300

**Shared Services:**
- **PostgreSQL**: Primary + 2 Replicas (Read-only)
- **Redis**: Cluster 3 nodes
- **Storage**: S3 ou equivalente para `auth_data`

**Configuração:**
```env
# Cada instância
MAX_CONCURRENT_SESSIONS=300
DB_POOL_MAX=30
QUEUE_CONCURRENCY=15

# Usar S3 para auth_data (implementar)
AUTH_DATA_STORAGE=s3
AUTH_DATA_S3_BUCKET=zaphub-auth-data
```

---

## 📊 Monitoramento de Capacidade

### API Endpoint: GET /api/v1/sessions/stats

```bash
curl http://localhost:3000/api/v1/sessions/stats
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "capacity": {
      "active": 45,
      "max": 100,
      "available": 55,
      "usage_percent": 45.00
    },
    "sessions_by_status": {
      "connected": 45,
      "qr_pending": 3,
      "disconnected": 12,
      "failed": 2
    },
    "limits": {
      "db_pool_max": 20,
      "queue_concurrency": 10
    }
  }
}
```

### Alertas Recomendados:

- ⚠️ **usage_percent > 80%**: Preparar para escalar
- 🚨 **usage_percent > 95%**: Escalar URGENTE
- 🔴 **active >= max**: Sessões bloqueadas

---

## 🎯 Limites e Gargalos

### 1. **Memória RAM**
- **Cada sessão**: 10-30MB
- **100 sessões**: ~3GB
- **1000 sessões**: ~30GB

**Solução**: Horizontal scaling (múltiplas instâncias)

### 2. **WebSocket Connections**
- **Limite Linux**: File descriptors
- **Padrão**: 1024 FDs
- **Recomendado**: 65536+ FDs

```bash
# Permanente: /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536
```

### 3. **Database Connections**
- **Pool padrão**: 10 conexões
- **Recomendado Tier 2**: 50 conexões
- **Recomendado Tier 3**: Connection pooler (PgBouncer)

### 4. **Redis**
- **Filas BullMQ**: Pode saturar Redis
- **Solução**: Redis Cluster ou múltiplas instâncias

---

## 🔧 Tuning de Performance

### PostgreSQL:
```sql
-- postgresql.conf
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1  -- Para SSD
effective_io_concurrency = 200
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

### Node.js:
```bash
# Aumentar heap size
NODE_OPTIONS="--max-old-space-size=4096"

# Múltiplos workers (cluster mode)
PM2_INSTANCES=4
```

### Redis:
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

---

## 📦 Deploy com Docker Compose (Tier 2)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: zaphub
      POSTGRES_USER: zaphub
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    shm_size: 1gb

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data

  zaphub-api:
    build: .
    environment:
      NODE_ENV: production
      MAX_CONCURRENT_SESSIONS: 200
      DB_POOL_MAX: 50
    volumes:
      - ./auth_data:/app/auth_data
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 3  # 3 instâncias
      resources:
        limits:
          cpus: '2'
          memory: 8G

volumes:
  pgdata:
  redisdata:
```

---

## 📈 Roadmap de Melhorias

### Curto Prazo (1-3 meses):
- [ ] Implementar health checks (`/health`)
- [ ] Metrics (Prometheus/Grafana)
- [ ] Rate limiting por sessão
- [ ] Retry inteligente para mensagens

### Médio Prazo (3-6 meses):
- [ ] Storage S3 para `auth_data`
- [ ] Session affinity (sticky sessions)
- [ ] Auto-scaling baseado em métricas
- [ ] Backup automático de sessões

### Longo Prazo (6-12 meses):
- [ ] Multi-region deployment
- [ ] Session migration entre workers
- [ ] WebSocket proxy para reduzir conexões
- [ ] Message batching para otimizar envios

---

## 🛡️ Segurança em Escala

### Isolamento de Clientes:
```javascript
// Cada cliente NUNCA pode:
// - Acessar mensagens de outro cliente
// - Ver QR code de outro cliente
// - Interferir em outras sessões

// Implementado via:
// - API Key por sessão (opcional)
// - Row-level security no PostgreSQL
// - Validação de sessionId em todos endpoints
```

### Rate Limiting:
```javascript
// Implementar limites por cliente
const LIMITS = {
  messages_per_minute: 60,
  messages_per_hour: 1000,
  messages_per_day: 10000,
};
```

---

## 💰 Estimativa de Custos

| Clientes | Tier | Hardware | Custo/Mês |
|----------|------|----------|-----------|
| 1-50     | 1    | 4GB RAM  | $25-50    |
| 50-200   | 2    | 16GB RAM | $100-200  |
| 200-500  | 3    | 3x8GB    | $300-500  |
| 500-1000 | 3    | 5x16GB   | $800-1200 |
| 1000+    | 3    | Custom   | $2000+    |

---

## 🎓 Conclusão

O ZapHub **já suporta** multi-tenancy desde o design inicial:

✅ **Sim, pode atender centenas de clientes** na mesma instalação
✅ **Sim, cada cliente tem auth_data isolado**
✅ **Sim, escala horizontalmente** com load balancer
✅ **Limite atual**: 100 sessões simultâneas (configurável)

**Para produção:**
1. Configure `MAX_CONCURRENT_SESSIONS` apropriado
2. Monitore `/api/v1/sessions/stats`
3. Escale horizontalmente quando usage > 80%
4. Use PostgreSQL tuning para Tier 2+
5. Implemente Redis Cluster para Tier 3

**Próximos passos recomendados:**
- Implementar health checks
- Configurar Prometheus/Grafana
- Testar load testing com 100+ sessões
- Documentar procedures de backup/restore
