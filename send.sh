#!/bin/bash

################################################################################
# Script SIMPLES para enviar mensagem - SEM ENROLAÇÃO
################################################################################

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Uso: ./send.sh <numero> <mensagem>"
    echo ""
    echo "Exemplos:"
    echo "  ./send.sh 5534996853220 'Oi, teste'"
    echo "  ./send.sh 553496853220 'Teste sem o 9'"
    echo ""
    exit 1
fi

NUMERO=$1
MENSAGEM=$2
API="http://localhost:3001/api/v1"

# Pegar sessão conectada
SESSION=$(curl -s "$API/sessions" | jq -r '.data[] | select(.status == "connected") | .id' | head -1)

if [ -z "$SESSION" ]; then
    echo "❌ Nenhuma sessão conectada!"
    echo ""
    echo "Para conectar:"
    echo "1. Crie sessão: curl -X POST $API/sessions -H 'Content-Type: application/json' -d '{\"label\":\"Teste\"}'"
    echo "2. Pegue o QR: curl \"$API/sessions/SEU_SESSION_ID/qr?format=raw\""
    echo "3. Escaneie com WhatsApp"
    exit 1
fi

echo "📱 Sessão: $SESSION"

# Adicionar @s.whatsapp.net se não tiver
if [[ ! "$NUMERO" =~ @s.whatsapp.net$ ]]; then
    NUMERO="${NUMERO}@s.whatsapp.net"
fi

echo "📤 Enviando para: $NUMERO"

# Enviar
RESULT=$(curl -s -X POST "$API/sessions/$SESSION/messages" \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"msg-$(date +%s)\",
    \"to\": \"$NUMERO\",
    \"type\": \"text\",
    \"text\": \"$MENSAGEM\"
  }")

# Verificar resultado
if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
    MSG_ID=$(echo "$RESULT" | jq -r '.data.id')
    echo "✅ Enviado! ID: $MSG_ID"
    
    # Aguardar 3 segundos
    sleep 3
    
    # Verificar status
    STATUS=$(curl -s "$API/sessions/$SESSION/messages/$MSG_ID" | jq -r '.data.status')
    echo "📊 Status: $STATUS"
else
    echo "❌ ERRO:"
    echo "$RESULT" | jq '.'
fi
