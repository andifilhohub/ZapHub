# Integração Chatwoot + ZapHub WhatsApp API

Guia completo para conectar o Chatwoot com a API ZapHub e gerenciar conversas do WhatsApp.

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Pré-requisitos](#pré-requisitos)
- [Passo 1: Configurar ZapHub](#passo-1-configurar-zaphub)
- [Passo 2: Criar Canal WhatsApp no Chatwoot](#passo-2-criar-canal-whatsapp-no-chatwoot)
- [Passo 3: Conectar via QR Code](#passo-3-conectar-via-qr-code)
- [Passo 4: Configurar Webhooks](#passo-4-configurar-webhooks)
- [Passo 5: Testar Integração](#passo-5-testar-integração)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## 🎯 Visão Geral

Esta integração permite que o **Chatwoot** gerencie conversas do WhatsApp através da **API ZapHub**, que utiliza a biblioteca Baileys para conexão oficial com o WhatsApp Web.

### Arquitetura:

```
WhatsApp ←→ ZapHub API (Baileys) ←→ Chatwoot
```

**Fluxo:**
1. Chatwoot cria uma sessão no ZapHub
2. ZapHub gera QR Code para autenticação
3. WhatsApp conecta via QR Code
4. Mensagens são sincronizadas bidirecionalmente via webhooks

---

## ✅ Pré-requisitos

### No Servidor ZapHub:

- ✅ Node.js 18+ instalado
- ✅ PostgreSQL rodando
- ✅ Redis rodando
- ✅ ZapHub API rodando em `http://localhost:3000`

### No Chatwoot:

- ✅ Chatwoot instalado e configurado
- ✅ Acesso administrativo
- ✅ Capacidade de configurar canais personalizados (API Channel)

---

## 🚀 Passo 1: Configurar ZapHub

### 1.1 Verificar se a API está rodando

```bash
curl http://localhost:3000/api/v1/health
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

### 1.2 Configurar Autenticação (Opcional)

Por padrão, a autenticação está **desabilitada** para facilitar desenvolvimento.

**Para produção, edite `.env`:**

```bash
# Security
API_KEY_ENABLED=true
API_KEY=sua-chave-secreta-aqui-xyz123
```

**Reinicie o servidor:**
```bash
npm start
```

### 1.3 Iniciar Workers de Eventos

Os workers processam mensagens e eventos em background:

```bash
npm run worker        # Workers principais
npm run worker:events # Workers de eventos (typing, read receipts, etc)
```

---

## 📱 Passo 2: Criar Canal WhatsApp no Chatwoot

### 2.1 Acessar Configurações

1. Login no Chatwoot como administrador
2. Vá em **Settings** → **Inboxes**
3. Clique em **Add Inbox**

### 2.2 Selecionar Tipo de Canal

- Escolha **API Channel** (ou **WhatsApp** se disponível)
- Nome do canal: `WhatsApp - ZapHub`

### 2.3 Configurar Webhook URL

O Chatwoot precisa receber eventos do ZapHub.

**URL do Webhook Chatwoot:**
```
https://seu-chatwoot.com/api/v1/accounts/{ACCOUNT_ID}/inboxes/{INBOX_ID}/webhooks
```

**⚠️ Substitua:**
- `seu-chatwoot.com` → Seu domínio Chatwoot
- `{ACCOUNT_ID}` → ID da conta (encontre em Settings → Account)
- `{INBOX_ID}` → Será gerado após criar o canal

---

## 🔗 Passo 3: Conectar via QR Code

### 3.1 Criar Sessão no ZapHub

Use a API do ZapHub para criar uma nova sessão WhatsApp:

**Endpoint:**
```
POST http://localhost:3000/api/v1/sessions
```

**Request Body:**
```json
{
  "label": "Chatwoot - Atendimento",
  "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp"
}
```

**Exemplo cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Chatwoot - Atendimento",
    "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "6137713e-97d9-4045-8b6f-857378719571",
    "label": "Chatwoot - Atendimento",
    "status": "initializing",
    "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp",
    "created_at": "2025-11-15T02:30:00.000Z"
  },
  "message": "Session created successfully. Initialization in progress."
}
```

**⚠️ Importante:** Salve o `session_id` retornado!

### 3.2 Obter QR Code

Aguarde 2-3 segundos para o QR Code ser gerado, então:

**Endpoint:**
```
GET http://localhost:3000/api/v1/sessions/{SESSION_ID}/qr?format=data_url
```

**Exemplo:**
```bash
SESSION_ID="6137713e-97d9-4045-8b6f-857378719571"

curl "http://localhost:3000/api/v1/sessions/$SESSION_ID/qr?format=data_url"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEs...",
    "generated_at": "2025-11-15T02:30:05.000Z"
  }
}
```

### 3.3 Escanear QR Code

**Opção 1: Via Interface Web (Recomendado)**

Crie uma página HTML simples para exibir o QR:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ZapHub - Conectar WhatsApp</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        #qr-code { max-width: 400px; margin: 20px auto; }
        .status { padding: 10px; margin: 20px; border-radius: 5px; }
        .initializing { background: #fff3cd; color: #856404; }
        .connected { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <h1>🚀 ZapHub - Conectar WhatsApp</h1>
    <div id="status" class="status initializing">Inicializando...</div>
    <div id="qr-container"></div>
    <button onclick="location.reload()">🔄 Atualizar QR Code</button>

    <script>
        const SESSION_ID = 'COLE_SEU_SESSION_ID_AQUI';
        const API_URL = 'http://localhost:3000/api/v1';
        
        async function getQRCode() {
            try {
                const response = await fetch(`${API_URL}/sessions/${SESSION_ID}/qr?format=data_url`);
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('qr-container').innerHTML = 
                        `<img id="qr-code" src="${data.data.qr_code}" alt="QR Code" />
                         <p>📱 Escaneie com seu WhatsApp</p>
                         <p><small>QR Code expira em 60 segundos</small></p>`;
                    
                    // Verificar status a cada 3 segundos
                    checkStatus();
                } else {
                    throw new Error(data.message || 'QR Code não disponível');
                }
            } catch (error) {
                document.getElementById('status').innerHTML = 
                    `❌ Erro: ${error.message}`;
                document.getElementById('status').className = 'status error';
            }
        }
        
        async function checkStatus() {
            const response = await fetch(`${API_URL}/sessions/${SESSION_ID}/status`);
            const data = await response.json();
            
            const statusDiv = document.getElementById('status');
            
            if (data.data.status === 'connected') {
                statusDiv.innerHTML = 
                    `✅ Conectado! Número: ${data.data.phone_number || 'N/A'}`;
                statusDiv.className = 'status connected';
            } else if (data.data.status === 'initializing') {
                statusDiv.innerHTML = '⏳ Aguardando leitura do QR Code...';
                statusDiv.className = 'status initializing';
                setTimeout(checkStatus, 3000); // Verificar novamente em 3s
            } else {
                statusDiv.innerHTML = `📡 Status: ${data.data.status}`;
                setTimeout(checkStatus, 3000);
            }
        }
        
        // Iniciar
        getQRCode();
    </script>
</body>
</html>
```

**Salve como `connect.html` e abra no navegador!**

**Opção 2: Via cURL + Terminal**

```bash
# 1. Obter QR Code em base64
SESSION_ID="6137713e-97d9-4045-8b6f-857378719571"
QR_BASE64=$(curl -s "http://localhost:3000/api/v1/sessions/$SESSION_ID/qr" | jq -r '.data.qr_code')

# 2. Salvar como imagem PNG
echo $QR_BASE64 | base64 -d > qrcode.png

# 3. Abrir no visualizador de imagens
xdg-open qrcode.png  # Linux
# ou
open qrcode.png      # MacOS
```

**Opção 3: Integração no Chatwoot**

Configure o Chatwoot para exibir o QR Code na interface administrativa ao configurar o canal.

### 3.4 Verificar Conexão

```bash
curl http://localhost:3000/api/v1/sessions/$SESSION_ID/status
```

**Resposta (Conectado):**
```json
{
  "success": true,
  "data": {
    "id": "6137713e-97d9-4045-8b6f-857378719571",
    "status": "connected",
    "is_connected": true,
    "phone_number": "5511999999999",
    "connected_at": "2025-11-15T02:30:10.000Z",
    "last_seen": "2025-11-15T02:35:00.000Z"
  }
}
```

---

## 🔔 Passo 4: Configurar Webhooks

### 4.1 Eventos Disponíveis

O ZapHub envia os seguintes eventos via webhook:

| Evento | Descrição | Payload |
|--------|-----------|---------|
| `message.received` | Nova mensagem recebida | Mensagem completa + remetente |
| `message.sent` | Mensagem enviada | Confirmação de envio |
| `message.delivered` | Mensagem entregue | Timestamp de entrega |
| `message.read` | Mensagem lida | Timestamp de leitura |
| `message.reaction` | Reação adicionada | Emoji + mensagem original |
| `presence.update` | Status de presença | Digitando, online, offline |
| `call.offer` | Chamada recebida | Dados da chamada |
| `group.participants.update` | Mudanças no grupo | Membros add/remove |

### 4.2 Formato do Webhook

**Estrutura do Payload:**
```json
{
  "event": "message.received",
  "session_id": "6137713e-97d9-4045-8b6f-857378719571",
  "timestamp": "2025-11-15T02:30:00.000Z",
  "data": {
    "message_id": "3EB0C431C72FE708E4B1",
    "from": "5511999999999@s.whatsapp.net",
    "to": "5511888888888@s.whatsapp.net",
    "type": "text",
    "text": "Olá, preciso de ajuda!",
    "timestamp": 1731629400000,
    "from_me": false
  }
}
```

### 4.3 Endpoint do Chatwoot

O Chatwoot deve expor um endpoint para receber webhooks:

```
POST https://seu-chatwoot.com/api/v1/webhooks/whatsapp
```

**Headers necessários:**
```
Content-Type: application/json
```

### 4.4 Atualizar Webhook URL (Se Necessário)

```bash
SESSION_ID="6137713e-97d9-4045-8b6f-857378719571"

curl -X PATCH "http://localhost:3000/api/v1/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://seu-chatwoot-novo.com/api/v1/webhooks/whatsapp"
  }'
```

---

## 📤 Passo 5: Enviar Mensagens pelo Chatwoot

### 5.1 Endpoint de Envio

O Chatwoot deve chamar este endpoint para enviar mensagens:

```
POST http://localhost:3000/api/v1/sessions/{SESSION_ID}/messages
```

### 5.2 Exemplos de Mensagens

#### **Mensagem de Texto:**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "text",
  "text": "Olá! Como posso ajudar você hoje?"
}
```

#### **Mensagem com Imagem:**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "image",
  "image": {
    "url": "https://seu-servidor.com/imagens/produto.jpg",
    "caption": "Confira nosso produto!"
  }
}
```

#### **Mensagem com Documento:**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "document",
  "document": {
    "url": "https://seu-servidor.com/docs/catalogo.pdf",
    "fileName": "catalogo-2025.pdf",
    "mimetype": "application/pdf"
  }
}
```

#### **Mensagem de Áudio (PTT):**
```json
{
  "to": "5511999999999@s.whatsapp.net",
  "type": "audio",
  "audio": {
    "url": "https://seu-servidor.com/audio/mensagem.mp3",
    "ptt": true
  }
}
```

### 5.3 Exemplo cURL Completo:

```bash
SESSION_ID="6137713e-97d9-4045-8b6f-857378719571"

curl -X POST "http://localhost:3000/api/v1/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Mensagem enviada via Chatwoot + ZapHub!"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "msg-12345",
    "status": "queued",
    "message_type": "text",
    "to": "5511999999999@s.whatsapp.net",
    "queued_at": "2025-11-15T02:30:00.000Z"
  }
}
```

---

## 🔍 Passo 6: Testar Integração

### 6.1 Teste de Mensagem Recebida

1. Envie uma mensagem do seu WhatsApp para o número conectado
2. Verifique se o webhook foi chamado no Chatwoot
3. Confirme se a conversa aparece na inbox do Chatwoot

### 6.2 Teste de Mensagem Enviada

1. Responda uma conversa pelo Chatwoot
2. Verifique se a mensagem chegou no WhatsApp do cliente
3. Confirme o status de entrega/leitura

### 6.3 Teste de Eventos

```bash
# Ver todos os eventos de uma sessão
curl "http://localhost:3000/api/v1/sessions/$SESSION_ID/events?limit=20"

# Ver apenas eventos de presença (typing)
curl "http://localhost:3000/api/v1/sessions/$SESSION_ID/events?type=presence&limit=10"

# Ver confirmações de leitura
curl "http://localhost:3000/api/v1/sessions/$SESSION_ID/events?type=receipt&limit=10"
```

### 6.4 Verificar Logs

```bash
# Ver logs do servidor
tail -f logs/app.log

# Ver logs dos workers
tail -f logs/workers.log
```

---

## 🛠️ Troubleshooting

### ❌ Problema: QR Code não aparece

**Possíveis causas:**
- Sessão ainda inicializando
- Sessão já conectada anteriormente

**Solução:**
```bash
# Verificar status da sessão
curl http://localhost:3000/api/v1/sessions/$SESSION_ID/status

# Se status = "connected", QR não é necessário
# Se status = "failed", criar nova sessão
```

### ❌ Problema: QR Code expirou

**Solução:**
```bash
# Deletar sessão antiga
curl -X DELETE http://localhost:3000/api/v1/sessions/$SESSION_ID

# Criar nova sessão
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"label": "Nova Sessão"}'
```

### ❌ Problema: Webhooks não chegam no Chatwoot

**Verificações:**
1. Confirme que `webhook_url` está correto
2. Teste o endpoint do Chatwoot com cURL:
   ```bash
   curl -X POST https://seu-chatwoot.com/api/v1/webhooks/whatsapp \
     -H "Content-Type: application/json" \
     -d '{"event": "test", "data": {}}'
   ```
3. Verifique firewall/rede entre ZapHub e Chatwoot
4. Verifique logs do ZapHub para erros de webhook

### ❌ Problema: Mensagens não são enviadas

**Verificações:**
```bash
# 1. Verificar status da sessão
curl http://localhost:3000/api/v1/sessions/$SESSION_ID/status

# 2. Verificar formato do número (deve incluir @s.whatsapp.net)
# Correto: 5511999999999@s.whatsapp.net
# Errado: 5511999999999

# 3. Ver mensagens na fila
curl "http://localhost:3000/api/v1/sessions/$SESSION_ID/messages?status=queued"
```

### ❌ Problema: Sessão desconecta frequentemente

**Possíveis causas:**
- WhatsApp Web aberto em outro dispositivo
- Problemas de rede
- Sessão sendo usada em múltiplos locais

**Solução:**
```bash
# Verificar última vez online
curl http://localhost:3000/api/v1/sessions/$SESSION_ID/status | jq '.data.last_seen'

# Recriar sessão se necessário
```

---

## 📚 API Reference

### Autenticação

**Sem autenticação (padrão):**
```bash
curl http://localhost:3000/api/v1/sessions
```

**Com autenticação (se habilitada):**
```bash
# Opção 1: Header
curl http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer sua-chave-aqui"

# Opção 2: Query parameter
curl "http://localhost:3000/api/v1/sessions?api_key=sua-chave-aqui"
```

### Endpoints Principais

#### **1. Listar Sessões**
```
GET /api/v1/sessions
```

#### **2. Criar Sessão**
```
POST /api/v1/sessions
Body: { "label": "Nome", "webhook_url": "URL" }
```

#### **3. Obter QR Code**
```
GET /api/v1/sessions/:id/qr?format=data_url
```

#### **4. Verificar Status**
```
GET /api/v1/sessions/:id/status
```

#### **5. Enviar Mensagem**
```
POST /api/v1/sessions/:id/messages
Body: { "to": "number@s.whatsapp.net", "type": "text", "text": "..." }
```

#### **6. Listar Mensagens**
```
GET /api/v1/sessions/:id/messages?limit=50&offset=0
```

#### **7. Listar Eventos**
```
GET /api/v1/sessions/:id/events?type=presence&limit=20
```

#### **8. Enviar Indicador de Digitando**
```
POST /api/v1/sessions/:id/presence
Body: { "jid": "number@s.whatsapp.net", "type": "composing" }
```

#### **9. Atualizar Sessão**
```
PATCH /api/v1/sessions/:id
Body: { "webhook_url": "nova-url" }
```

#### **10. Deletar Sessão**
```
DELETE /api/v1/sessions/:id
```

### Tipos de Mensagem Suportados

- ✅ `text` - Texto simples
- ✅ `image` - Imagens (JPG, PNG, WEBP)
- ✅ `video` - Vídeos (MP4, 3GP, AVI)
- ✅ `audio` - Áudios e notas de voz (MP3, OGG, WAV)
- ✅ `document` - Documentos (PDF, DOC, XLS, etc)
- ✅ `location` - Localização geográfica
- ✅ `contact` - Contatos (vCard)
- ✅ `reaction` - Reações com emoji
- ✅ `template` - Mensagens template (WhatsApp Business)

---

## 🎯 Exemplo de Integração Completa

### Script de Setup Automatizado

```bash
#!/bin/bash

# Configurações
ZAPHUB_URL="http://localhost:3000/api/v1"
CHATWOOT_WEBHOOK="https://seu-chatwoot.com/api/v1/webhooks/whatsapp"

echo "🚀 Configurando integração Chatwoot + ZapHub..."

# 1. Criar sessão
echo "1️⃣ Criando sessão..."
SESSION_RESPONSE=$(curl -s -X POST "$ZAPHUB_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"label\": \"Chatwoot\", \"webhook_url\": \"$CHATWOOT_WEBHOOK\"}")

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.data.id')
echo "   ✅ Session ID: $SESSION_ID"

# 2. Aguardar QR Code
echo "2️⃣ Aguardando QR Code..."
sleep 3

# 3. Obter QR Code
QR_RESPONSE=$(curl -s "$ZAPHUB_URL/sessions/$SESSION_ID/qr?format=data_url")
QR_CODE=$(echo $QR_RESPONSE | jq -r '.data.qr_code')

echo "   ✅ QR Code gerado!"
echo "   📱 Acesse: file://$(pwd)/qr.html"

# 4. Criar HTML com QR Code
cat > qr.html <<EOF
<!DOCTYPE html>
<html>
<head><title>QR Code - ZapHub</title></head>
<body style="text-align: center; padding: 50px;">
    <h1>🚀 Escaneie o QR Code</h1>
    <img src="$QR_CODE" style="max-width: 400px;" />
    <p><a href="$ZAPHUB_URL/sessions/$SESSION_ID/status">Verificar Status</a></p>
</body>
</html>
EOF

echo "   ✅ Abra o arquivo qr.html no navegador!"

# 5. Monitorar status
echo "3️⃣ Monitorando conexão..."
while true; do
    STATUS=$(curl -s "$ZAPHUB_URL/sessions/$SESSION_ID/status" | jq -r '.data.status')
    
    if [ "$STATUS" == "connected" ]; then
        PHONE=$(curl -s "$ZAPHUB_URL/sessions/$SESSION_ID/status" | jq -r '.data.phone_number')
        echo "   ✅ CONECTADO! Número: $PHONE"
        break
    fi
    
    echo "   ⏳ Status: $STATUS (verificando novamente em 5s...)"
    sleep 5
done

echo ""
echo "🎉 Integração configurada com sucesso!"
echo "   📋 Session ID: $SESSION_ID"
echo "   📞 WhatsApp conectado"
echo "   🔔 Webhooks enviando para: $CHATWOOT_WEBHOOK"
```

**Salve como `setup-chatwoot.sh` e execute:**
```bash
chmod +x setup-chatwoot.sh
./setup-chatwoot.sh
```

---

## 📖 Recursos Adicionais

### Documentação Completa:

- **Eventos**: `/docs/EVENTS.md` - Todos os eventos nativos do WhatsApp
- **Postman**: `/postman/ZapHub_Messages_Collection.json` - Collection com 40+ requests
- **README Postman**: `/postman/README.md` - Guia de uso do Postman

### URLs Úteis:

- **Health Check**: `http://localhost:3000/api/v1/health`
- **API Docs**: `http://localhost:3000/api/v1/docs` (se Swagger estiver habilitado)
- **Webhook Events**: `http://localhost:3000/api/v1/webhook/events`

---

## 🔐 Segurança em Produção

### Recomendações:

1. **Ativar autenticação via API Key:**
   ```bash
   API_KEY_ENABLED=true
   API_KEY=chave-forte-aleatoria-xyz-123
   ```

2. **Usar HTTPS:**
   - Configure SSL/TLS no servidor
   - Use proxy reverso (Nginx, Caddy)

3. **Limitar taxa de requisições:**
   - Implemente rate limiting
   - Configure no Nginx ou use middleware

4. **Validar webhooks:**
   - Adicione assinatura HMAC nos webhooks
   - Valide origem das requisições

5. **Monitoramento:**
   - Configure logs centralizados
   - Use ferramentas como Grafana + Prometheus

---

## 💬 Suporte

**Problemas comuns?** Consulte a seção [Troubleshooting](#troubleshooting)

**Dúvidas?** Abra uma issue no repositório ou consulte a documentação completa.

---

**ZapHub + Chatwoot** = ❤️ Atendimento WhatsApp Profissional

*Última atualização: 15 de Novembro de 2025*
