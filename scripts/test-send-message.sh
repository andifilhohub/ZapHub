#!/bin/bash

# Script para testar envio de mensagens manualmente
# Usage: ./test-send-message.sh

API_URL="http://localhost:3000/api/v1"
API_KEY="your-secret-api-key-change-in-production"
SESSION_ID="your-session-id-here"  # Substituir pelo ID real da sessão

echo "🧪 Testando envio de mensagens no ZapHub"
echo ""

# 1. Criar uma sessão (se não tiver)
echo "1️⃣ Criando sessão de teste..."
SESSION_RESPONSE=$(curl -s -X POST "${API_URL}/sessions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Sessão de Teste - Envio de Mensagens",
    "webhook_url": "https://webhook.site/your-unique-id"
  }')

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.id')
echo "✅ Sessão criada: ${SESSION_ID}"
echo ""

# Aguardar QR Code
echo "2️⃣ Aguardando QR Code..."
sleep 2

# Pegar QR Code
QR_RESPONSE=$(curl -s -X GET "${API_URL}/sessions/${SESSION_ID}/qr" \
  -H "Authorization: Bearer ${API_KEY}")

echo "📱 Escaneie o QR Code abaixo com WhatsApp:"
echo ""
echo $QR_RESPONSE | jq -r '.qr'
echo ""
echo "⏳ Aguardando conexão... (pressione CTRL+C se não conectar em 60s)"
sleep 60

# Verificar status
echo ""
echo "3️⃣ Verificando status da conexão..."
STATUS_RESPONSE=$(curl -s -X GET "${API_URL}/sessions/${SESSION_ID}/status" \
  -H "Authorization: Bearer ${API_KEY}")

echo $STATUS_RESPONSE | jq '.'
IS_CONNECTED=$(echo $STATUS_RESPONSE | jq -r '.isConnected')

if [ "$IS_CONNECTED" != "true" ]; then
  echo "❌ Sessão não conectada. Tente novamente."
  exit 1
fi

echo "✅ Sessão conectada!"
echo ""

# 4. Enviar mensagem de TEXTO
echo "4️⃣ Enviando mensagem de TEXTO..."
TEXT_RESPONSE=$(curl -s -X POST "${API_URL}/sessions/${SESSION_ID}/messages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "test-msg-'$(date +%s)'",
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "🧪 Mensagem de teste do ZapHub! Horário: '$(date +"%Y-%m-%d %H:%M:%S")'"
  }')

echo $TEXT_RESPONSE | jq '.'
echo ""

# 5. Enviar mensagem com IMAGEM
echo "5️⃣ Enviando mensagem com IMAGEM..."
IMAGE_RESPONSE=$(curl -s -X POST "${API_URL}/sessions/${SESSION_ID}/messages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "test-img-'$(date +%s)'",
    "to": "5511999999999@s.whatsapp.net",
    "type": "image",
    "image": {
      "url": "https://picsum.photos/400/300",
      "caption": "📸 Imagem de teste enviada via ZapHub API"
    }
  }')

echo $IMAGE_RESPONSE | jq '.'
echo ""

# 6. Testar IDEMPOTÊNCIA (enviar mesma mensagem 2x)
echo "6️⃣ Testando IDEMPOTÊNCIA..."
MESSAGE_ID="idempotent-test-$(date +%s)"

echo "Enviando mensagem 1ª vez..."
FIRST_SEND=$(curl -s -X POST "${API_URL}/sessions/${SESSION_ID}/messages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "'${MESSAGE_ID}'",
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Teste de idempotência"
  }')

echo $FIRST_SEND | jq '.'
FIRST_STATUS=$(echo $FIRST_SEND | jq -r '.status')

echo ""
echo "Enviando mensagem 2ª vez (mesmo messageId)..."
SECOND_SEND=$(curl -s -X POST "${API_URL}/sessions/${SESSION_ID}/messages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "'${MESSAGE_ID}'",
    "to": "5511999999999@s.whatsapp.net",
    "type": "text",
    "text": "Teste de idempotência"
  }')

echo $SECOND_SEND | jq '.'
SECOND_STATUS=$(echo $SECOND_SEND | jq -r '.status')

if [ "$FIRST_STATUS" = "$SECOND_STATUS" ]; then
  echo "✅ Idempotência funcionando! Status idêntico: ${FIRST_STATUS}"
else
  echo "⚠️  Status diferente: 1ª=${FIRST_STATUS}, 2ª=${SECOND_STATUS}"
fi

echo ""
echo "7️⃣ Listando mensagens enviadas..."
MESSAGES_LIST=$(curl -s -X GET "${API_URL}/sessions/${SESSION_ID}/messages?limit=10" \
  -H "Authorization: Bearer ${API_KEY}")

echo $MESSAGES_LIST | jq '.'

echo ""
echo "✅ Testes concluídos!"
echo "📊 Resumo:"
echo "   - Sessão ID: ${SESSION_ID}"
echo "   - Mensagens enviadas: 3 (texto, imagem, idempotência)"
echo "   - Status: Verifique os logs dos workers para confirmação"
