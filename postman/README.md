# ZapHub - Postman Collection

Coleção completa do Postman para testar todos os recursos da API ZapHub.

## 📦 Conteúdo da Coleção

### 1. **Setup** (3 requests)
- ✅ Create Session
- ✅ Get QR Code
- ✅ Check Status

### 2. **Mensagens** (9 tipos)
- ✅ Text Message
- ✅ Image Message
- ✅ Video Message
- ✅ Audio Message (PTT)
- ✅ Document Message (PDF)
- ✅ Location Message
- ✅ Contact Message (vCard)
- ✅ Reaction Message
- ✅ Template Message

### 3. **WhatsApp Events** (20+ requests)

#### **Presence Events** (5 requests)
- ✅ Send Typing Indicator
- ✅ Send Recording Indicator
- ✅ Set Online Status
- ✅ Set Offline Status
- ✅ Subscribe to Presence Updates

#### **Query Events** (7 requests)
- ✅ Get All Events
- ✅ Get Presence Events
- ✅ Get Receipt Events
- ✅ Get Reaction Events
- ✅ Get Call Events
- ✅ Get Group Events
- ✅ Get Events with Date Range

#### **Call Events** (6 requests)
- ✅ Get All Calls
- ✅ Get Incoming Calls (Offers)
- ✅ Get Missed Calls
- ✅ Get Video Calls Only
- ✅ Get Voice Calls Only
- ✅ Get Rejected Calls

### 4. **Idempotency Test**
- ✅ Send Same Message Twice

### 5. **List & Get Messages**
- ✅ List All Messages
- ✅ Filter by Status
- ✅ Get Message by ID

## 🚀 Como Usar

### 1. Importar a Coleção

1. Abra o Postman
2. Clique em **Import**
3. Selecione o arquivo `ZapHub_Messages_Collection.json`
4. A coleção será importada com todas as variáveis configuradas

### 2. Configurar Variáveis

A coleção já vem com variáveis pré-configuradas em **Collection Variables**:

| Variável | Valor Padrão | Descrição |
|----------|--------------|-----------|
| `base_url` | `http://localhost:3000/api/v1` | URL base da API |
| `api_key` | `test-api-key-12345` | API Key para autenticação |
| `session_id` | `1` | ID da sessão (preenchido automaticamente) |
| `recipient` | `5511999999999@s.whatsapp.net` | Número de destino das mensagens |
| `message_id` | `` | ID da mensagem (gerado automaticamente) |

**⚠️ IMPORTANTE:** Altere o valor de `recipient` para um número WhatsApp válido!

### 3. Workflow Recomendado

#### **Primeira Vez:**

1. **Create Session** (em `0. Setup`)
   - Cria uma nova sessão
   - O `session_id` é salvo automaticamente

2. **Get QR Code** (em `0. Setup`)
   - Obtém o QR Code para autenticação
   - Escaneie com seu WhatsApp

3. **Check Status** (em `0. Setup`)
   - Verifique se a sessão está conectada
   - Status deve ser `"connected"`

#### **Enviar Mensagens:**

4. Execute qualquer request da pasta de mensagens (1-9)
   - O `message_id` é gerado automaticamente
   - Mensagens são enviadas para o `recipient` configurado

#### **Testar Eventos:**

5. **Subscribe to Presence Updates** (em `WhatsApp Events > Presence Events`)
   - SEMPRE execute primeiro para receber eventos de presença

6. **Send Typing Indicator**
   - Envia status "digitando..." para o contato

7. **Get Presence Events** (em `WhatsApp Events > Query Events`)
   - Consulta eventos de presença recebidos

8. **Get All Events**
   - Consulta todos os eventos (presença, leituras, chamadas, etc.)

9. **Get All Calls** (em `WhatsApp Events > Call Events`)
   - Consulta histórico de chamadas

## 📋 Exemplos de Uso

### Exemplo 1: Enviar "Digitando..." e depois uma mensagem

```
1. Send Typing Indicator → Status: composing
2. (Aguardar 2-3 segundos)
3. Text Message → "Olá! Como vai?"
4. Set Online Status → Status: available
```

### Exemplo 2: Consultar eventos de leitura

```
1. Enviar uma mensagem de texto
2. Aguardar o destinatário ler
3. Get Receipt Events → Verificar readTimestamp
```

### Exemplo 3: Monitorar chamadas perdidas

```
1. Receber uma chamada (não atender)
2. Get Missed Calls → Ver chamadas com status "timeout"
3. Opcional: Enviar mensagem automática
```

### Exemplo 4: Rastrear reações

```
1. Enviar uma mensagem
2. Receber reação do destinatário
3. Get Reaction Events → Ver emoji e timestamp
```

## 🔍 Filtros Avançados

### Filtrar Eventos por Tipo

```
GET /sessions/:id/events?type=presence
GET /sessions/:id/events?type=receipt
GET /sessions/:id/events?type=reaction
GET /sessions/:id/events?type=call
GET /sessions/:id/events?type=group
```

### Filtrar por Data

```
GET /sessions/:id/events?from=2025-01-01T00:00:00Z&to=2025-12-31T23:59:59Z
```

### Filtrar Chamadas

```
GET /sessions/:id/calls?status=offer       # Chamadas recebidas
GET /sessions/:id/calls?status=timeout     # Chamadas perdidas
GET /sessions/:id/calls?status=reject      # Chamadas rejeitadas
GET /sessions/:id/calls?is_video=true      # Apenas vídeo
GET /sessions/:id/calls?is_video=false     # Apenas voz
```

## 🧪 Testes Automáticos

A coleção inclui testes automáticos em alguns requests:

### Send Typing Indicator
```javascript
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

pm.test('Typing indicator sent', function () {
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.expect(response.data.type).to.equal('composing');
});
```

### Get All Events
```javascript
pm.test('Events returned', function () {
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.expect(response.data.events).to.be.an('array');
});
```

## 📊 Estrutura de Respostas

### Evento de Presença
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "uuid",
        "event_type": "presence.update",
        "event_category": "presence",
        "jid": "5511999999999@s.whatsapp.net",
        "participant": "5511999999999@s.whatsapp.net",
        "payload": {
          "lastKnownPresence": "composing",
          "timestamp": "2025-01-16T12:00:00.000Z"
        },
        "created_at": "2025-01-16T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "has_more": true
    }
  }
}
```

### Histórico de Chamadas
```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "id": "uuid",
        "call_id": "CALL_ID_12345",
        "chat_id": "5511999999999@s.whatsapp.net",
        "from_jid": "5511888888888@s.whatsapp.net",
        "is_video": false,
        "status": "offer",
        "offline": false,
        "timestamp": "2025-01-16T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "limit": 20,
      "offset": 0,
      "has_more": true
    }
  }
}
```

## 🔧 Troubleshooting

### Erro: "Session not found"
- ✅ Execute `Create Session` primeiro
- ✅ Verifique se `session_id` está preenchido nas variáveis

### Erro: "Session is not connected"
- ✅ Execute `Get QR Code` e escaneie
- ✅ Execute `Check Status` para confirmar status "connected"

### Presence events não aparecem
- ✅ Execute `Subscribe to Presence Updates` PRIMEIRO
- ✅ A presença expira em ~10 segundos, envie periodicamente

### Calls não aparecem no histórico
- ✅ Verifique se o worker de eventos está rodando: `npm run worker:events`
- ✅ Verifique migrations aplicadas

## 📚 Documentação Completa

Para mais detalhes sobre eventos e webhooks, consulte:

- **docs/EVENTS.md** - Documentação completa de eventos
- **EVENTOS_IMPLEMENTADOS.md** - Guia rápido de implementação

## 🎯 Ordem Recomendada de Testes

1. ✅ Setup (Create Session, Get QR, Check Status)
2. ✅ Text Message (testar envio básico)
3. ✅ Subscribe to Presence Updates
4. ✅ Send Typing Indicator
5. ✅ Get Presence Events
6. ✅ Get All Events
7. ✅ Testar outros tipos de mensagens (Image, Video, etc.)
8. ✅ Get Receipt Events (após mensagens serem lidas)
9. ✅ Get All Calls (se receber chamadas)

## 💡 Dicas

- **Idempotência**: Use o mesmo `messageId` para eviar mensagens duplicadas
- **Paginação**: Use `limit` e `offset` para grandes volumes de eventos
- **Date Range**: Filtre eventos por período com `from` e `to`
- **Webhooks**: Configure `webhook_url` para receber eventos em tempo real
- **Workers**: Mantenha `npm run worker:events` rodando para processar eventos

## 🚀 Scripts NPM Necessários

```bash
# Servidor API
npm start

# Workers principais
npm run worker

# Workers de eventos (NOVO!)
npm run worker:events
```

---

**ZapHub** - Complete WhatsApp API Platform 🚀
