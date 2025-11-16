#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📱 Monitorando QR Codes do ZapHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏳ Aguardando geração de QR Code..."
echo ""

# Limpar arquivo de marcador
rm -f /tmp/last_qr_line 2>/dev/null

# Monitorar log em tempo real
tail -f /tmp/zaphub.log 2>/dev/null | while read line; do
    # Quando detectar "Escaneie o QR code"
    if echo "$line" | grep -q "Escaneie o QR code"; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  🎯 NOVO QR CODE GERADO!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        # Aguardar um pouco para o QR estar completo no log
        sleep 1
        
        # Pegar as últimas 20 linhas após a mensagem
        tail -n 500 /tmp/zaphub.log | grep -A20 "Escaneie o QR code abaixo" | tail -n 17 | head -n 15
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  ⚠️  Escaneie ESTE QR Code com seu WhatsApp"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
    fi
    
    # Quando conectar com sucesso
    if echo "$line" | grep -q "logged in"; then
        echo ""
        echo "✅ CONECTADO COM SUCESSO!"
        echo ""
        break
    fi
done
