#!/bin/bash

SESSION_ID="29a65abf-4e8c-43c8-af60-52841e5642bf"
TEST_PHONE="553496853220@s.whatsapp.net"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📱 Aguardando conexão (escaneie o QR Code)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Aguardar até 60 segundos
for i in {1..60}; do
    STATUS=$(curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/status" | jq -r '.data.is_connected // false')
    PHONE=$(curl -s "http://localhost:3001/api/v1/sessions/$SESSION_ID/status" | jq -r '.data.phone_number // null')
    
    if [ "$STATUS" = "true" ] && [ "$PHONE" != "null" ]; then
        echo ""
        echo "✅ Conectado! Número: $PHONE"
        echo ""
        break
    fi
    
    echo -ne "\r⏳ Aguardando... ${i}s "
    sleep 1
done

if [ "$STATUS" != "true" ]; then
    echo ""
    echo "❌ Timeout - QR Code não foi escaneado"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📤 Enviando mensagem de teste"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE=$(curl -s -X POST "http://localhost:3001/api/v1/sessions/$SESSION_ID/messages/text" \
  -H 'Content-Type: application/json' \
  -d "{
    \"to\": \"$TEST_PHONE\",
    \"text\": \"🎉 Teste limpo funcionou! $(date +%H:%M:%S)\",
    \"messageId\": \"test-$(date +%s)\"
  }")

echo "$RESPONSE" | jq

SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
    echo ""
    echo "✅ Mensagem enviada com sucesso!"
    echo "📱 Verifique se chegou no contato 553496853220"
else
    echo ""
    echo "❌ Erro ao enviar mensagem"
fi
