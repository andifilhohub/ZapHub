# 📚 ZapHub API - Referência Rápida

Documentação objetiva dos endpoints da API ZapHub.

**Base URL:** `http://localhost:3001/api/v1`

---

## 🔌 **1. Health Check**

Verificar se a API está online.

### **Endpoint**
```
GET /health
```

### **Response (200)**
```json
{
  "success": true,
  "status": "healthy",
  "service": "ZapHub API",
  "version": "1.0.0"
}
```

---

## 📱 **2. Criar Sessão WhatsApp**

Criar uma nova sessão WhatsApp.

### **Endpoint**
```
POST /sessions
```

### **Request Body**
```json
{
  "label": "Nome da Sessão",
  "webhook_url": "https://seu-servidor.com/webhook"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `label` | string | ✅ Sim | Nome identificador da sessão |
| `webhook_url` | string | ❌ Não | URL para receber eventos |

### **Response (201)**
```json
{
  "success": true,
  "data": {
    "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
    "label": "Nome da Sessão",
    "status": "initializing",
    "webhook_url": "https://seu-servidor.com/webhook",
    "created_at": "2025-11-15T16:30:24.956Z"
  }
}
```

⚠️ **Importante:** Aguarde **3-5 segundos** após criar a sessão antes de solicitar o QR code.

---

## 🔲 **3. Obter QR Code**

Obter QR code para escanear no WhatsApp.

### **Endpoint**
```
GET /sessions/{session_id}/qr
```

### **Query Parameters**
| Parâmetro | Valores | Padrão | Descrição |
|-----------|---------|--------|-----------|
| `format` | `raw` \| `base64` \| `data_url` | `base64` | Formato do QR code |

### **Formatos de QR Code**

#### **1. Raw (Texto Puro)**
```
GET /sessions/{session_id}/qr?format=raw
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_code": "2@Af4Ki7s5VvVW8jUpS1Zkn3cPDdU...",
    "generated_at": null
  }
}
```

#### **2. Base64 (Padrão)**
```
GET /sessions/{session_id}/qr
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_code": "iVBORw0KGgoAAAANSUhEUgAAAMgAAADI...",
    "generated_at": null
  }
}
```

#### **3. Data URL (HTML-ready)**
```
GET /sessions/{session_id}/qr?format=data_url
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAA...",
    "generated_at": null
  }
}
```

**Uso em HTML:**
```html
<img src="data:image/png;base64,iVBORw0KGgoAAAA..." />
```

### **Errors**

#### **QR não disponível (404)**
```json
{
  "error": "QR code not available. Session may already be connected or not initialized."
}
```
**Solução:** Aguarde 3-5 segundos e tente novamente.

#### **Sessão não encontrada (404)**
```json
{
  "error": "Session with ID xxx not found"
}
```

#### **QR expirado (410)**
```json
{
  "error": "QR code expired. Please request a new session initialization."
}
```
**Solução:** Delete a sessão e crie uma nova.

---

## 📊 **4. Verificar Status da Sessão**

Verificar status da conexão WhatsApp.

### **Endpoint**
```
GET /sessions/{session_id}/status
```

### **Response (200)**

#### **Aguardando QR Code**
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

#### **Conectado**
```json
{
  "success": true,
  "data": {
    "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
    "db_status": "connected",
    "runtime_status": "connected",
    "is_connected": true,
    "phone_number": "5511999999999",
    "has_qr_code": false
  }
}
```

### **Status Possíveis**

| db_status | runtime_status | is_connected | Descrição |
|-----------|----------------|--------------|-----------|
| `initializing` | `disconnected` | `false` | Iniciando sessão |
| `qr_pending` | `disconnected` | `false` | QR pronto, aguardando scan |
| `connected` | `connected` | `true` | Conectado e ativo |
| `disconnected` | `disconnected` | `false` | Desconectado |

---

## 💬 **5. Enviar Mensagem de Texto**

Enviar mensagem de texto para um contato.

### **Endpoint**
```
POST /sessions/{session_id}/messages
```

### **Request Body**
```json
{
  "messageId": "msg-1234567890-5678",
  "to": "5511999999999@s.whatsapp.net",
  "type": "text",
  "text": "Olá! Esta é uma mensagem de teste."
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `messageId` | string | ✅ Sim | ID único para idempotência (evita duplicatas) |
| `to` | string | ✅ Sim | Número do destinatário + `@s.whatsapp.net` |
| `type` | string | ✅ Sim | Tipo da mensagem (`text`) |
| `text` | string | ✅ Sim | Conteúdo da mensagem |

### **Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "3EB0C7F8F7F7F7F7F7F7",
    "status": "sent"
  }
}
```

---

## 🖼️ **6. Enviar Imagem**

Enviar imagem para um contato.

### **Endpoint**
```
POST /sessions/{session_id}/messages
```

### **Request Body**
```json
{
  "messageId": "msg-1234567890-5679",
  "to": "5511999999999@s.whatsapp.net",
  "type": "image",
  "image": {
    "url": "https://example.com/imagem.jpg",
    "caption": "Legenda da imagem"
  }
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `messageId` | string | ✅ Sim | ID único para idempotência |
| `to` | string | ✅ Sim | Número do destinatário |
| `type` | string | ✅ Sim | `image` |
| `image.url` | string | ✅ Sim | URL da imagem |
| `image.caption` | string | ❌ Não | Legenda da imagem |

### **Response (200)**
```json
{
  "success": true,
  "data": {
    "id": "3EB0C7F8F7F7F7F7F7F7",
    "status": "sent"
  }
}
```

---

## 📄 **7. Enviar Documento**

Enviar arquivo/documento para um contato.

### **Endpoint**
```
POST /sessions/{session_id}/messages
```

### **Request Body**
```json
{
  "messageId": "msg-1234567890-5680",
  "to": "5511999999999@s.whatsapp.net",
  "type": "document",
  "document": {
    "url": "https://example.com/arquivo.pdf",
    "fileName": "documento.pdf",
    "caption": "Descrição do documento"
  }
}
```

**⚠️ Nota:** O campo é `fileName` (camelCase), não `filename`.

---

## 🎤 **8. Enviar Áudio**

Enviar áudio para um contato.

### **Endpoint**
```
POST /sessions/{session_id}/messages
```

### **Request Body**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "audio",
  "audio": {
    "url": "https://example.com/audio.mp3"
  }
}
```

---

## 🎥 **9. Enviar Vídeo**

Enviar vídeo para um contato.

### **Endpoint**
```
POST /sessions/{session_id}/messages
```

### **Request Body**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "video",
  "video": {
    "url": "https://example.com/video.mp4",
    "caption": "Legenda do vídeo"
  }
}
```

---

## 🗑️ **10. Deletar Sessão**

Deletar uma sessão WhatsApp.

### **Endpoint**
```
DELETE /sessions/{session_id}
```

### **Response (200)**
```json
{
  "success": true,
  "message": "Session deleted successfully"
}
```

---

## 📋 **11. Listar Todas as Sessões**

Listar todas as sessões criadas.

### **Endpoint**
```
GET /sessions
```

### **Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
      "label": "Sessão 1",
      "status": "connected",
      "created_at": "2025-11-15T16:30:24.956Z"
    },
    {
      "id": "8823a1b2-c3d4-5678-e9f0-1234567890ab",
      "label": "Sessão 2",
      "status": "qr_pending",
      "created_at": "2025-11-15T17:45:12.123Z"
    }
  ]
}
```

---

## 🔔 **12. Webhooks (Receber Eventos)**

O ZapHub envia eventos para o `webhook_url` configurado na sessão.

### **Formato do Webhook**
```json
{
  "event": "message",
  "session_id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
  "data": {
    "from": "5511999999999@s.whatsapp.net",
    "message": {
      "type": "text",
      "text": "Olá!"
    },
    "timestamp": 1700000000
  }
}
```

### **Tipos de Eventos**

| Evento | Descrição |
|--------|-----------|
| `message` | Nova mensagem recebida |
| `message.status` | Status de mensagem enviada (sent, delivered, read) |
| `presence.update` | Contato online/offline/digitando |
| `connection.update` | Mudança no status da conexão |
| `call` | Chamada recebida |

### **Exemplo: Mensagem Recebida**
```json
{
  "event": "message",
  "session_id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
  "data": {
    "from": "5511999999999@s.whatsapp.net",
    "message": {
      "type": "text",
      "text": "Olá, como posso ajudar?"
    },
    "timestamp": 1700000000,
    "message_id": "3EB0C7F8F7F7F7F7F7F7"
  }
}
```

### **Exemplo: Status de Mensagem**
```json
{
  "event": "message.status",
  "session_id": "2112d3f5-b9e4-4476-a7e8-e125a722527d",
  "data": {
    "message_id": "3EB0C7F8F7F7F7F7F7F7",
    "status": "read",
    "timestamp": 1700000000
  }
}
```

---

## 🚀 **Fluxo Completo de Conexão**

```bash
# 1. Criar sessão
curl -X POST http://localhost:3001/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Minha Sessão",
    "webhook_url": "https://meu-servidor.com/webhook"
  }'

# Resposta: { "data": { "id": "SESSION_ID", ... } }

# 2. Aguardar 5 segundos
sleep 5

# 3. Obter QR code
curl "http://localhost:3001/api/v1/sessions/SESSION_ID/qr?format=data_url"

# Resposta: { "data": { "qr_code": "data:image/png;base64,..." } }

# 4. Exibir QR para usuário escanear

# 5. Verificar status (polling a cada 3 segundos)
curl "http://localhost:3001/api/v1/sessions/SESSION_ID/status"

# Quando is_connected = true, está conectado!

# 6. Enviar mensagem
curl -X POST http://localhost:3001/api/v1/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Olá!"
  }'
```

---

## ⚠️ **Regras Importantes**

1. **Aguardar após criar sessão:** Sempre espere 3-5 segundos antes de solicitar o QR code
2. **QR expira em 60 segundos:** Se não escanear, delete a sessão e crie outra
3. **Formato de número:** Sempre incluir `@s.whatsapp.net` no final
4. **Polling de status:** Verificar a cada 3 segundos se conectou
5. **Webhook URL:** Deve ser HTTPS em produção
6. **Uma sessão = Uma conexão:** Não criar múltiplas sessões com mesmo número

---

## 🔢 **Códigos de Status HTTP**

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `201` | Criado com sucesso |
| `400` | Erro na requisição (dados inválidos) |
| `404` | Não encontrado |
| `410` | QR code expirado |
| `500` | Erro no servidor |

---

## 📱 **Formato de Números WhatsApp**

```
Padrão Internacional: [código país][DDD][número]@s.whatsapp.net

Exemplos:
- Brasil: 5511999999999@s.whatsapp.net
- EUA: 1234567890@s.whatsapp.net
- Portugal: 351912345678@s.whatsapp.net
```

**Remover:** espaços, parênteses, hífens, sinais de +

---

## 🎯 **Exemplo Completo em cURL**

```bash
#!/bin/bash

# Configurações
API_URL="http://localhost:3001/api/v1"
WEBHOOK_URL="https://seu-servidor.com/webhook"

# Criar sessão
echo "Criando sessão..."
RESPONSE=$(curl -s -X POST "$API_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"label\":\"Teste\",\"webhook_url\":\"$WEBHOOK_URL\"}")

SESSION_ID=$(echo $RESPONSE | jq -r '.data.id')
echo "Sessão criada: $SESSION_ID"

# Aguardar inicialização
echo "Aguardando 5 segundos..."
sleep 5

# Obter QR code
echo "Obtendo QR code..."
QR_RESPONSE=$(curl -s "$API_URL/sessions/$SESSION_ID/qr?format=raw")
QR_CODE=$(echo $QR_RESPONSE | jq -r '.data.qr_code')
echo "QR Code: $QR_CODE"

# Verificar status até conectar
echo "Aguardando conexão..."
while true; do
  STATUS_RESPONSE=$(curl -s "$API_URL/sessions/$SESSION_ID/status")
  IS_CONNECTED=$(echo $STATUS_RESPONSE | jq -r '.data.is_connected')
  
  if [ "$IS_CONNECTED" = "true" ]; then
    PHONE=$(echo $STATUS_RESPONSE | jq -r '.data.phone_number')
    echo "Conectado! Número: $PHONE"
    break
  fi
  
  echo "Ainda não conectado... Tentando novamente em 3s"
  sleep 3
done

# Enviar mensagem
echo "Enviando mensagem..."
curl -X POST "$API_URL/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Olá! Mensagem de teste."
  }'

echo "Pronto!"
```

---

**API simples, direta e funcional!** 🚀
