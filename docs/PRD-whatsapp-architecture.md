# PRD — Plataforma de Conexões WhatsApp (Baileys)

Versão: 1.0
Data: 2025-11-13
Autor: Andamento do projeto (documentação gerada automaticamente)

## 1. Objetivo
Construir uma API robusta e escalável para gerenciar múltiplas conexões com o WhatsApp usando a biblioteca Baileys. A plataforma deve permitir criar, monitorar e controlar várias sessões (conexões) simultâneas, enviar/receber mensagens com garantias operacionais (fila, retry, idempotência), e prover observabilidade e mecanismos de recuperação quando houver falhas.

Este PRD descreve requisitos funcionais e não-funcionais, arquitetura recomendada, componentes, fluxos críticos, tratamento de erros, operações e roadmap de implementação.

---

## 2. Visão & Problema
Times e aplicações precisam integrar o WhatsApp de forma confiável. A integração direta com clientes (um processo único por sessão) é frágil: gerenciamento de múltiplas sessões, reconexão, persistência de credenciais, throughput e rate-limits do WhatsApp criam complexidade. O objetivo é um middleware que abstraia esses problemas e ofereça uma API unificada para aplicações cliente.

Success Criteria (exemplos):
- Criar/registrar uma nova sessão e autenticar via QR com UX claro.
- Enviar mensagens com alta confiabilidade (retry + DLQ) e idempotência.
- Escalar para centenas de sessões (apenas hardware e mensagens legais do WhatsApp permitting).
- Observabilidade mínima: métricas, logs estruturados, health checks.

---

## 3. Escopo
Inclui:
- API para gerenciar conexões (criar, listar, atualizar, remover).
- API para enviar mensagens por conexão (sync/async) com filas e retry.
- Recepção de mensagens (webhooks ou endpoints que o cliente consome).
- Persistência de metadados de sessão, histórico e fila.
- Cache para sessão ativa e enfileiramento (Redis/BullMQ ou RabbitMQ).
- Dashboard ou endpoints de administração (básico).

Fora do escopo inicial:
- UI sofisticada (apenas endpoints e documentação).
- Regras comerciais complexas (templates de marketing, templates aprovados, etc.).

---

## 4. Requisitos Funcionais (exemplos)
1. CRUD de conexões (sessions): criar, listar, obter status, encerrar/logoff.
2. Enviar mensagem (por sessionId): request síncrono que enfileira a mensagem e devolve um id; resposta final via query ou webhook.
3. Receber mensagem: o sistema entrega eventos para consumidores (webhooks/filas internas).
4. Gestão de credenciais e arquivos de sessão (auth_data), armazenamento seguro.
5. Políticas de retry configuráveis por fila e mecanismo de DLQ.
6. Idempotência: clientes podem reenviar payload com messageId e o servidor garante processamento único.
7. Healthchecks por sessão e para o service (/health, /metrics).

---

## 5. Requisitos Não-Funcionais
- Segurança: TLS, autenticação (JWT/ApiKey) nas APIs, proteção de credenciais.
- Disponibilidade: projetar para falhas de processo; reinício deve recuperar sessões a partir do estado persistido.
- Performance: latência de enfileiramento < 100ms; throughput depende do WhatsApp limits.
- Observabilidade: logs estruturados (pino/winston), métricas Prometheus, tracing opcional.
- Testabilidade: testes unitários, testes de integração (mock Baileys), testes de carga.

---

## 6. Visão Geral da Arquitetura

Componentes principais:
- API Gateway / Express app — expõe endpoints REST/HTTP
- Connection Manager — módulo responsável por lifecycle das sessões (start/stop/reconnect)
- Session Store (persistência) — Postgres/Mongo para metadata (sessions, messages, audit)
- Cache & Queue — Redis: cache de sessões ativas + BullMQ para filas de envio/recebimento
- Workers — processos que consomem filas e interagem com Baileys (send/receive)
- Message Broker (opcional) — RabbitMQ/Redis pubsub para entrega de eventos a consumidores
- Admin/Observability — endpoints /metrics, /health e logs
- Storage seguro de credenciais — arquivos `auth_data` no disco ou S3, com encriptação opcional

Arquitetura proposta (simplificada ASCII):

Client(s)
  |
  |---> API (Express, Auth) ---+--- Session Store (Postgres)
                               |--- Redis (cache + BullMQ)
                               |--- Admin (/metrics)

Workers (1..N)
  |---> Consomem filas BullMQ -> Interagem com Baileys instances (startWhatsApp socket)
  |---> Publicam eventos (webhooks / broker)

Baileys (por session)
  |-- socket.ev (events)
  |-- sendMessage / receive

Observações:
- Cada conexão Baileys roda dentro de um processo Worker (ou dentro do API process, dependendo do design). Recomendado: separar Workers para isolar crashes e reduzir blast radius.
- Redis atua como ponto central para filas e para pub/sub entre múltiplos processos.

---

## 7. Fluxos Críticos

7.1 Criar/Registrar Sessão
- Cliente chama POST /connections
- API cria metadata na base (sessionId, label, config) e adiciona job para Worker iniciar a sessão
- Worker pega job, chama `startWhatsApp({ dataDir: <path/sessionId> })` e publica status `QR`/`CONNECTED`/`FAILED`
- API disponibiliza endpoint para buscar qr/png ou logs para scan

7.2 Enviar Mensagem (recomendado async)
- Cliente chama POST /connections/:id/send com payload { messageId, to, type, body }
- API valida, grava comando na tabela messages (status=queued) e cria job BullMQ na fila de envio da sessionId
- Worker consome job, executa envio via socket.sendMessage(jid, content) com idempotencyKey=messageId
- On success: atualiza status message=sent; publica evento (webhook/response)
- On failure: aplica política de retry (exponencial). Após X falhas: move para DLQ e notifica

7.3 Receber Mensagem
- Baileys socket em Worker recebe messages.upsert -> Worker publica evento para filas internas
- API/Consumer process pode entregar via webhook ou persistir em DB

7.4 Reconnect / Session Expiry
- Connection Manager observa socket.ev 'connection.update'
- Se connection === 'close' -> analisar reason -> tentar reconnect com backoff, ou marcar session as loggedOut
- Em loggedOut: sinalizar para admin e bloquear envio pela session até nova autenticação

---

## 8. Componentes Detalhados

8.1 Connection Manager (core)
Responsabilidades:
- Start/stop de sockets Baileys para uma sessionId
- Reconciliation: restart sockets no boot se persistido
- Emitir status events (QR, OPEN, CLOSE, ERROR)
- Encaminhar mensagens recebidas para fila/DB
- Expor health checks por sessão

8.2 Workers & Queueing
- Cada session tem uma fila lógica (BullMQ namespace `session:<id>:outbox`) ou filas com routing
- Worker pool configurável: capacidade de paralelo controlada
- Retry policy configurável: retries, backoff, maxAttempts, moveToFailed
- DLQ (dead-letter queue) para análise manual

8.3 Cache (Redis)
- Cache rápido de `sessionId -> socket metadata` (por exemplo, status, lastSeen)
- Uso de Redis TTL para dados efêmeros
- Pub/Sub para eventos entre processos (status update, broadcast)

8.4 Persistence (Postgres)
- Tabelas principais:
  - sessions (id, label, status, created_at, updated_at, last_seen, meta)
  - messages (id, session_id, message_id (idempotency), to, payload, status, attempts, error, created_at, processed_at)
  - events/audit (timestamp, session_id, type, detail)
- Racional: durabilidade e consultas SQL para auditoria

8.5 Message Broker / Webhooks
- Para entregar mensagens para sistemas cliente, disponibilizar:
  - webhook endpoint configurável por connection
  - ou publicar em tópico RabbitMQ/Redis para integração internal

---

## 9. Garantias de Entrega e Idempotência
- Idempotency key obrigatório no envio (`messageId`) — gravar antes de enfileirar e checar duplicatas
- Pelo menos uma vez (at-least-once) ao nível do worker; consumidor final deve ser idempotente
- Para exactly-once aparente: combinar deduplicação no banco com acknowledgement.

---

## 10. Estratégia de Retry e DLQ
- Retries exponenciais: base=1s, multiplier=2, maxAttempts=5 (configurável)
- Em falhas permanentes (status code ou error pattern), mover direto para DLQ
- DLQ insulated para análises manuais e replay

---

## 11. Observabilidade e Operações
- Logs estruturados (pino) com nível por ambiente
- Expor `/metrics` Prometheus: jobs_processed, jobs_failed, socket_status, messages_sent, messages_failed, queue_size
- Health endpoints: `/health` (liveness), `/ready` (readiness) com checks: DB, Redis, Worker
- Alerts: alta taxa de reconnects, DLQ items, sockets loggedOut

---

## 12. Segurança
- TLS em todas as comunicações públicas
- Autenticação API: JWT ou ApiKeys com revogação
- Armazenamento seguro de `auth_data` (compressão + encriptação se armazenado em S3)
- Rotina de limpeza e rotação de chaves
- Rate limiting nas APIs para evitar abuso

---

## 13. Testes e QA
- Unit tests para Connection Manager e workers usando mocks do Baileys
- Integration tests com um runner que simula sockets (mocks ou um ambiente controlado)
- Load testing: simular N sessions e M msg/s para achar gargalos
- Chaos testing: matar processos workers, desconectar rede e verificar auto-recovery

---

## 14. Failures e Runbook (principais)
14.1 Socket fica em 'close' permanentemente
- Checar logs, identificar statusCode, se loggedOut -> re-autenticação manual (remover auth_data)
- Se reconnection loop, reiniciar worker e analisar erros

14.2 Mensagens empilhando em fila (fila crescendo)
- Verificar workers ativos e suas métricas
- Escalar workers (horizontal) ou aumentar concurrency
- Checar erros repetidos (DLQ)

14.3 Sessões não inicializam no boot
- Verificar acesso a storage de auth_data
- Checar permissões

14.4 Perda de dados (DB down)
- Montar fallback: buffer local em Redis até restabelecer DB
- Retentar persistência e reconciliar

---

## 15. Roadmap de Implementação (fases)
MVP (0-2 semanas):
- API básica Express com endpoints para criar/listar/connections
- Mock queues (BullMQ com Redis) + Worker simples que usa `startWhatsApp` (ou mock)
- Página de testes (send.html) integrada

Fase 2 (2-6 semanas):
- Integração real com `startWhatsApp` por sessão
- Persistência Postgres para sessions/messages
- Idempotência e DLQ
- Healthchecks e métricas

Fase 3 (6-12 semanas):
- Escalabilidade: orquestração (Docker/K8s), autoscaling de workers
- Admin UI para gerenciar sessões e visualizar DLQ
- Segurança & produção hardening (secrets, encriptação)

---

## 16. Decisões Técnicas (recomendadas)
- Node.js + Express (já no projeto) — bom ecossistema e compatibilidade com Baileys
- Baileys para WhatsApp Web socket
- Redis + BullMQ para filas e DLQ (simples e bem documentado)
- Postgres para persistência durável
- Opcional: RabbitMQ se precisar de features avançadas de broker e multi-language consumers
- Docker para empacotamento; prefira deploy em K8s para escala

Racional: Redis/BullMQ simplifica filas de job + retry, tem boa integração com Node e é suficiente para a maioria dos casos.

---

## 17. Esquemas e Payloads (exemplos)
POST /connections
{
  "label": "Loja A - 1",
  "webhookUrl": "https://app.meucliente.com/webhook",
  "config": { }
}

Response: { "sessionId": "uuid" }

POST /connections/:id/send
{
  "messageId": "uuid", // idempotency
  "to": "5534999999999@s.whatsapp.net",
  "type": "text",
  "body": "Olá"
}

Response 202: { "queued": true, "messageId": "uuid" }

Webhook example (message delivered / incoming):
POST https://app.meucliente.com/webhook
{
  "event": "message.received",
  "sessionId": "...",
  "payload": { ... }
}

---

## 18. Checklist de Qualidade / Lançamento
- [ ] Endpoints cobertos por testes unitários
- [ ] Testes integrados com mock Baileys
- [ ] Alerting configurado (DLQ, reconnect rate)
- [ ] Backup & restore do DB/Redis
- [ ] Secrets gerenciados (Vault/K8s secrets)
- [ ] Documentação de runbook disponível

---

## 19. Próximos passos imediatos (tarefa técnica)
1. Escolher persistência (Postgres) e montar migrations básicas (sessions/messages)
2. Adicionar Redis e BullMQ ao projeto (instalar pacotes e criar fila de exemplo)
3. Implementar Connection Manager que inicializa `startWhatsApp` usando uma pasta de `dataDir` por sessionId
4. Implementar Worker que consome fila `session:<id>:outbox` e chama `socket.sendMessage`
5. Instrumentar health/metrics e um endpoint para gerar/servir QR (se necessário)

---

## 20. Anexos e Links Úteis
- Baileys docs: https://github.com/WhiskeySockets/Baileys
- BullMQ docs: https://docs.bullmq.io/
- Redis: https://redis.io/
- Postgres: https://www.postgresql.org/

---

Se quiser, eu já posso:
- Gerar as migrations iniciais e os esquemas das tabelas (`sessions`, `messages`, `events`).
- Implementar o esqueleto do Connection Manager e um worker mínimo que inicialize `startWhatsApp` por sessionId.
- Configurar o BullMQ (Redis) com um exemplo de fila de envio.

Diga qual desses passos quer que eu execute em seguida e eu implemento direto no repositório.
