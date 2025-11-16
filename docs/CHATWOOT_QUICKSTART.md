# 🚀 Quick Start: Chatwoot + ZapHub

Guia rápido de 5 minutos para conectar o Chatwoot ao WhatsApp.

---

## ⚡ Início Rápido

### 1️⃣ Interface Web (Recomendado)

Abra no navegador:
```
http://localhost:3000/chatwoot-connect.html
```

Preencha:
- ✅ URL da API ZapHub
- ✅ Webhook do Chatwoot  
- ✅ Nome da sessão

Clique em **"Criar Sessão"** e escaneie o QR Code!

---

### 2️⃣ Via cURL (Terminal)

```bash
# 1. Criar sessão
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Chatwoot",
    "webhook_url": "https://seu-chatwoot.com/api/v1/webhooks/whatsapp"
  }'

# Resposta: Copie o "id" da sessão
# SESSION_ID = "6137713e-97d9-4045-8b6f-857378719571"

# 2. Obter QR Code (aguarde 2-3 segundos)
curl "http://localhost:3000/api/v1/sessions/SESSION_ID/qr?format=data_url"

# 3. Verificar status
curl http://localhost:3000/api/v1/sessions/SESSION_ID/status
```

---

## 📚 Documentação Completa

Para integração detalhada, consulte:

📖 **[CHATWOOT_INTEGRATION.md](./CHATWOOT_INTEGRATION.md)**

Inclui:
- ✅ Configuração passo a passo
- ✅ Exemplos de código
- ✅ Troubleshooting
- ✅ API Reference completa
- ✅ Scripts automatizados

---

## 🔗 Links Úteis

| Recurso | URL |
|---------|-----|
| Interface de Conexão | `http://localhost:3000/chatwoot-connect.html` |
| Health Check | `http://localhost:3000/api/v1/health` |
| Listar Sessões | `http://localhost:3000/api/v1/sessions` |
| Documentação Completa | `docs/CHATWOOT_INTEGRATION.md` |
| Postman Collection | `postman/ZapHub_Messages_Collection.json` |

---

## ⚙️ Requisitos

- ✅ ZapHub rodando em `http://localhost:3000`
- ✅ PostgreSQL e Redis ativos
- ✅ Workers iniciados: `npm run worker` e `npm run worker:events`

---

## 💡 Dica

Use a interface web `chatwoot-connect.html` para uma experiência visual completa!

---

*ZapHub ❤️ Chatwoot*
