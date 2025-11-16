# 🔧 Troubleshooting - Integração Chatwoot + ZapHub

## ❌ **Erro Comum: "QR code not available"**

### 🔍 **Diagnóstico**

Se você está recebendo este erro:
```json
{
  "error": "QR code not available. Session may already be connected or not initialized."
}
```

### ✅ **SOLUÇÃO**

O problema **NÃO é do ZapHub**, é da configuração no Chatwoot!

---

## 🎯 **Verificação Rápida**

### **1. Confirme a URL CORRETA do ZapHub**

❌ **ERRADO:**
```
http://localhost:3000/api/v1
```

✅ **CORRETO:**
```
http://localhost:3001/api/v1
```

> **Nota:** A porta padrão do ZapHub é **3001** (configurada no `.env`)

---

### **2. Teste os Endpoints Manualmente**

#### **Passo 1: Health Check**
```bash
curl http://localhost:3001/api/v1/health
```

**Resposta esperada:**
```json
{
  "success": true,
  "status": "healthy",
  "service": "ZapHub API",
  "version": "1.0.0"
}
```

---

#### **Passo 2: Criar Sessão**
```bash
curl -X POST http://localhost:3001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Chatwoot - Teste",
    "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp"
  }'
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": {
    "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
    "label": "Chatwoot - Teste",
    "status": "initializing",
    "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp",
    "created_at": "2025-11-15T16:30:24.956Z"
  }
}
```

**⚠️ IMPORTANTE:** Salve o `id` da sessão!

---

#### **Passo 3: Aguardar Inicialização**

Aguarde **3-5 segundos** para o worker processar a sessão e gerar o QR Code.

---

#### **Passo 4: Obter QR Code**

```bash
# Formato RAW (texto puro)
curl "http://localhost:3001/api/v1/sessions/{SESSION_ID}/qr?format=raw"

# Formato Base64 (padrão)
curl "http://localhost:3001/api/v1/sessions/{SESSION_ID}/qr"

# Formato Data URL (pronto para HTML)
curl "http://localhost:3001/api/v1/sessions/{SESSION_ID}/qr?format=data_url"
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": {
    "qr_code": "2@Af4Ki7s5VvVW8jUpS1Zkn...",
    "generated_at": null
  }
}
```

---

#### **Passo 5: Verificar Status**

```bash
curl "http://localhost:3001/api/v1/sessions/{SESSION_ID}/status"
```

**Resposta esperada (aguardando QR):**
```json
{
  "success": true,
  "data": {
    "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
    "db_status": "qr_pending",
    "runtime_status": "disconnected",
    "is_connected": false,
    "has_qr_code": true
  }
}
```

**Resposta esperada (conectado):**
```json
{
  "success": true,
  "data": {
    "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
    "db_status": "connected",
    "runtime_status": "connected",
    "is_connected": true,
    "phone_number": "5511999999999"
  }
}
```

---

## 🐛 **Erros Comuns e Soluções**

### **Erro 1: Connection Refused**
```
curl: (7) Failed to connect to localhost port 3000: Connection refused
```

**Causa:** Porta errada ou servidor não está rodando

**Solução:**
```bash
# Verificar se servidor está rodando
ps aux | grep "node src/server/app.js"

# Verificar porta correta
cat .env | grep PORT

# Iniciar servidor
npm start
```

---

### **Erro 2: QR code not available**
```json
{
  "error": "QR code not available. Session may already be connected or not initialized."
}
```

**Causa:** Tentou obter QR antes do worker processar a sessão

**Solução:**
1. Aguarde 3-5 segundos após criar a sessão
2. Verifique se workers estão rodando:
   ```bash
   ps aux | grep "node src/workers"
   ```
3. Se não estiverem, inicie:
   ```bash
   npm run worker
   ```

---

### **Erro 3: Session not found**
```json
{
  "error": "Session with ID xxx not found"
}
```

**Causa:** Session ID inválido ou sessão deletada

**Solução:**
1. Liste todas as sessões:
   ```bash
   curl http://localhost:3001/api/v1/sessions
   ```
2. Crie uma nova sessão

---

### **Erro 4: QR code expired**
```json
{
  "error": "QR code expired. Please request a new session initialization."
}
```

**Causa:** QR Code tem validade de 60 segundos

**Solução:**
1. Delete a sessão antiga:
   ```bash
   curl -X DELETE http://localhost:3001/api/v1/sessions/{SESSION_ID}
   ```
2. Crie uma nova sessão

---

## 📋 **Checklist de Configuração Chatwoot**

- [ ] URL do ZapHub está correta (`http://localhost:3001/api/v1`)
- [ ] Servidor ZapHub está rodando (`npm start`)
- [ ] Workers estão rodando (`npm run worker`)
- [ ] Redis está rodando (`redis-cli ping` retorna `PONG`)
- [ ] PostgreSQL está rodando e acessível
- [ ] Webhook URL do Chatwoot está configurada corretamente
- [ ] Chatwoot aguarda 3-5 segundos após criar sessão antes de pedir QR
- [ ] Chatwoot está usando formato correto (`raw`, `base64` ou `data_url`)

---

## 🔬 **Diagnóstico Avançado**

### **Verificar logs do servidor**
```bash
# Terminal onde rodou npm start
# Procure por linhas como:
[SessionController] Creating new session...
[SessionController] Session created in DB
[SessionController] Getting QR code...
```

### **Verificar banco de dados**
```bash
PGPASSWORD=postgresql psql -h localhost -U postgres -d zaphub -c "
  SELECT id, status, 
    CASE WHEN qr_code IS NULL THEN 'NULL' ELSE 'EXISTE' END as qr_code,
    last_qr_at, created_at 
  FROM sessions 
  ORDER BY created_at DESC 
  LIMIT 5;
"
```

**Resultado esperado:**
```
id        | status     | qr_code | last_qr_at | created_at
----------|------------|---------|------------|------------
xxx-xxx   | qr_pending | EXISTE  |            | 2025-11-15...
```

### **Verificar filas Redis**
```bash
redis-cli
> KEYS bull:session-queue:*
> LLEN bull:session-queue:waiting
> LLEN bull:session-queue:active
> LLEN bull:session-queue:completed
> LLEN bull:session-queue:failed
```

---

## 🆘 **Ainda com problemas?**

### **Reset completo:**

```bash
# 1. Parar todos os processos
pkill -f "node src/server/app.js"
pkill -f "node src/workers"

# 2. Limpar Redis
redis-cli FLUSHDB

# 3. Limpar sessões antigas
PGPASSWORD=postgresql psql -h localhost -U postgres -d zaphub -c "
  DELETE FROM sessions WHERE status IN ('qr_pending', 'initializing');
"

# 4. Reiniciar servidor
npm start

# 5. Reiniciar workers
npm run worker

# 6. Criar nova sessão
curl -X POST http://localhost:3001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"label":"Nova Sessão","webhook_url":"https://seu-webhook.com"}'
```

---

## 📊 **Status de Serviços**

Todos os serviços precisam estar rodando:

| Serviço | Comando | Porta | Status |
|---------|---------|-------|--------|
| **API ZapHub** | `npm start` | 3001 | ✅ ONLINE |
| **Workers** | `npm run worker` | - | ✅ ONLINE |
| **Redis** | `redis-server` | 6379 | ✅ ONLINE |
| **PostgreSQL** | `sudo service postgresql start` | 5432 | ✅ ONLINE |

---

## 💡 **Exemplo de Integração Chatwoot**

```javascript
// Código exemplo para integrar no Chatwoot

class ZapHubIntegration {
  constructor(baseUrl = 'http://localhost:3001/api/v1') {
    this.baseUrl = baseUrl;
  }

  async createSession(label, webhookUrl) {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label,
        webhook_url: webhookUrl
      })
    });
    
    const data = await response.json();
    return data.data.id; // Retorna session ID
  }

  async getQRCode(sessionId) {
    // IMPORTANTE: Aguardar 3-5 segundos após criar sessão!
    await new Promise(r => setTimeout(r, 5000));
    
    const response = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/qr?format=data_url`
    );
    
    const data = await response.json();
    return data.data.qr_code; // Retorna QR em formato data URL
  }

  async checkStatus(sessionId) {
    const response = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/status`
    );
    
    const data = await response.json();
    return {
      isConnected: data.data.is_connected,
      phoneNumber: data.data.phone_number,
      status: data.data.db_status
    };
  }

  // Polling para aguardar conexão
  async waitForConnection(sessionId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.checkStatus(sessionId);
      
      if (status.isConnected) {
        return status; // Conectado!
      }
      
      await new Promise(r => setTimeout(r, 3000)); // Aguardar 3 segundos
    }
    
    throw new Error('Timeout aguardando conexão');
  }
}

// Uso:
const zaphub = new ZapHubIntegration();

// 1. Criar sessão
const sessionId = await zaphub.createSession(
  'Chatwoot - Atendimento',
  'https://seu-chatwoot.com/api/v1/webhooks/whatsapp'
);

// 2. Obter QR Code (aguarda automaticamente)
const qrCode = await zaphub.getQRCode(sessionId);

// 3. Exibir QR para usuário
document.getElementById('qr-image').src = qrCode;

// 4. Aguardar conexão
const connection = await zaphub.waitForConnection(sessionId);
console.log('Conectado!', connection.phoneNumber);
```

---

## 🎯 **Conclusão**

O **ZapHub está funcionando perfeitamente**. Se você está com problemas:

1. ✅ Confirme que está usando a porta correta (`3001`)
2. ✅ Aguarde 3-5 segundos após criar sessão antes de pedir QR
3. ✅ Verifique se todos os serviços estão rodando
4. ✅ Use os exemplos de código acima

**O problema está na integração do Chatwoot, não no ZapHub!** 🚀
