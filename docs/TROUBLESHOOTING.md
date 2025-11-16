# 🔧 Troubleshooting - ZapHub API

## Problema: Mensagens não chegam no WhatsApp

### Sintomas
- ✅ API retorna `200 OK` ao enviar mensagem
- ✅ Mensagem aparece como "enviada" no banco de dados
- ❌ Mensagem NÃO chega no WhatsApp do destinatário
- ⚠️ Status mostra `db_status: "connected"` mas `runtime_status: "disconnected"`

### Causa Raiz
A sessão está marcada como "conectada" no **banco de dados**, mas **NÃO está realmente conectada** no runtime (ConnectionManager/Worker). 

Isso acontece quando:
1. A sessão foi conectada anteriormente
2. O servidor foi reiniciado
3. O worker foi reiniciado
4. A sessão perdeu conexão mas o DB não foi atualizado

### Como Identificar
```bash
curl -s "http://localhost:3001/api/v1/sessions/SEU_SESSION_ID/status" | jq '.'
```

**Sessão com problema:**
```json
{
  "db_status": "connected",        ✅ (apenas no banco)
  "runtime_status": "disconnected", ❌ (não está realmente conectado)
  "is_connected": false,            ❌ (worker não vê conexão)
  "phone_number": null              ❌ (sem número)
}
```

**Sessão funcionando:**
```json
{
  "db_status": "connected",        ✅
  "runtime_status": "connected",   ✅
  "is_connected": true,            ✅
  "phone_number": "5511999999999"  ✅
}
```

### Solução

#### 1. Verificar sessões realmente conectadas
```bash
curl -s "http://localhost:3001/api/v1/sessions" | \
  jq '.data[] | select(.status == "connected") | {id, label, phone}'
```

Se não aparecer nenhuma sessão, **nenhuma está realmente conectada**.

#### 2. Deletar sessão com problema
```bash
curl -X DELETE "http://localhost:3001/api/v1/sessions/SEU_SESSION_ID"
```

#### 3. Criar nova sessão
```bash
curl -X POST "http://localhost:3001/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Nova Sessão WhatsApp",
    "webhook_url": "https://seu-webhook.com/whatsapp"
  }'
```

#### 4. Obter e escanear QR Code
```bash
# Salvar session_id da resposta anterior
SESSION_ID="cole-aqui-o-id-da-sessao"

# Gerar HTML com QR Code
curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/qr?format=data_url" | \
  jq -r '.data.qr_code' > /tmp/qr.txt

echo "<!DOCTYPE html>
<html><body style='text-align:center;padding:50px'>
<h1>Escaneie com WhatsApp</h1>
<img src='$(cat /tmp/qr.txt)' style='max-width:400px'>
</body></html>" > /tmp/qr.html

# Abrir no navegador
xdg-open /tmp/qr.html
```

#### 5. Aguardar conexão (polling)
```bash
for i in {1..20}; do
  STATUS=$(curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/status" | \
    jq -r '.data.runtime_status')
  
  echo "Tentativa $i/20: $STATUS"
  
  if [ "$STATUS" = "connected" ]; then
    echo "✅ CONECTADO!"
    break
  fi
  
  sleep 3
done
```

#### 6. Verificar número conectado
```bash
curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/status" | \
  jq '{
    phone: .data.phone_number,
    db_status: .data.db_status,
    runtime_status: .data.runtime_status,
    is_connected: .data.is_connected
  }'
```

#### 7. Agora sim, enviar mensagem
```bash
curl -X POST "http://localhost:3001/api/v1/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-'$(date +%s)'-test",
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Teste de mensagem após reconexão!"
  }'
```

---

## Problema: Worker não está processando mensagens

### Sintomas
- Mensagens ficam com status `queued` ou `processing` indefinidamente
- Nada chega no WhatsApp

### Verificar se worker está rodando
```bash
ps aux | grep "node.*worker" | grep -v grep
```

**Esperado:**
```
anderson  12345  2.5  5.8  node src/workers/index.js
```

### Iniciar worker manualmente
```bash
cd /home/anderson/workspace/zaphub
node src/workers/index.js
```

---

## Problema: QR Code não aparece

### Solução: Usar formato `data_url`
```bash
curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/qr?format=data_url" | \
  jq -r '.data.qr_code'
```

Cole o resultado em um `<img src="...">` no HTML.

---

## Problema: Erro "Session not connected"

Mesmo sintoma do primeiro problema. A sessão **precisa** estar com:
- ✅ `runtime_status: "connected"`
- ✅ `is_connected: true`

Não basta apenas `db_status: "connected"`.

---

## Validação Completa de Sessão Funcional

Use este checklist antes de enviar mensagens:

```bash
#!/bin/bash
SESSION_ID="seu-session-id"

echo "🔍 Validando sessão $SESSION_ID..."
echo ""

# 1. Sessão existe?
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3001/api/v1/sessions/$SESSION_ID/status")

if [ "$STATUS_CODE" != "200" ]; then
  echo "❌ Sessão não existe (HTTP $STATUS_CODE)"
  exit 1
fi
echo "✅ Sessão existe"

# 2. Status detalhado
RESPONSE=$(curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/status")

DB_STATUS=$(echo "$RESPONSE" | jq -r '.data.db_status')
RUNTIME_STATUS=$(echo "$RESPONSE" | jq -r '.data.runtime_status')
IS_CONNECTED=$(echo "$RESPONSE" | jq -r '.data.is_connected')
PHONE=$(echo "$RESPONSE" | jq -r '.data.phone_number')

echo "📊 Status:"
echo "   DB Status: $DB_STATUS"
echo "   Runtime Status: $RUNTIME_STATUS"
echo "   Is Connected: $IS_CONNECTED"
echo "   Phone: ${PHONE:-'não disponível'}"
echo ""

# 3. Validações críticas
ERRORS=0

if [ "$RUNTIME_STATUS" != "connected" ]; then
  echo "❌ Runtime NÃO conectado (runtime_status != 'connected')"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ Runtime conectado"
fi

if [ "$IS_CONNECTED" != "true" ]; then
  echo "❌ Flag is_connected = false"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ Flag is_connected = true"
fi

if [ "$PHONE" = "null" ] || [ -z "$PHONE" ]; then
  echo "❌ Número de telefone não disponível"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ Número conectado: $PHONE"
fi

# 4. Resultado
echo ""
if [ $ERRORS -eq 0 ]; then
  echo "🎉 Sessão está 100% funcional!"
  echo "Você pode enviar mensagens agora."
  exit 0
else
  echo "⚠️  Sessão tem $ERRORS problema(s)"
  echo "Mensagens NÃO serão enviadas!"
  echo ""
  echo "💡 Solução:"
  echo "   1. Deletar esta sessão: curl -X DELETE http://localhost:3001/api/v1/sessions/$SESSION_ID"
  echo "   2. Criar nova sessão"
  echo "   3. Escanear QR Code novamente"
  exit 1
fi
```

Salve como `validate_session.sh` e execute:
```bash
chmod +x validate_session.sh
./validate_session.sh
```

---

## Dicas Importantes

1. **Sempre verifique `runtime_status`**, não apenas `db_status`
2. **Se reiniciar o servidor**, todas as sessões precisam reconectar
3. **Worker precisa estar rodando** para enviar mensagens
4. **`phone_number` deve estar preenchido** para sessão funcional
5. **Use `messageId` único** para evitar duplicatas

---

## Resumo Rápido

| Situação | db_status | runtime_status | is_connected | Funciona? |
|----------|-----------|----------------|--------------|-----------|
| ✅ Conectado e funcionando | connected | connected | true | ✅ SIM |
| ❌ Apenas DB conectado | connected | disconnected | false | ❌ NÃO |
| ⚠️ Aguardando QR | qr_pending | disconnected | false | ❌ NÃO |
| ❌ Sessão morta | connected | null | false | ❌ NÃO |
