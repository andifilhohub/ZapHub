#!/bin/bash

################################################################################
# Teste Completo - Limpa tudo e faz conexão do zero
################################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:3001/api/v1"
TARGET_PHONE="${1:-5534996853220@s.whatsapp.net}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🧹 ZapHub - Teste Limpo (do Zero)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}⚠️  ATENÇÃO:${NC}"
echo -e "${YELLOW}   1. Você vai escanear o QR Code com SEU WhatsApp (remetente)${NC}"
echo -e "${YELLOW}   2. A mensagem será enviada PARA: $TARGET_PHONE${NC}"
echo -e "${YELLOW}   3. Sessões antigas serão removidas${NC}\n"

echo -e "${YELLOW}Continuar? (s/N)${NC} "
read -r confirm
if [[ ! "$confirm" =~ ^[Ss]$ ]]; then
    echo -e "${RED}Cancelado${NC}"
    exit 0
fi

# 1. Deletar todas as sessões antigas
echo -e "\n${YELLOW}[1/6]${NC} Removendo sessões antigas..."
SESSIONS=$(curl -s "$API_URL/sessions" | jq -r '.data[].id')
for sid in $SESSIONS; do
    echo -e "${BLUE}   Deletando sessão: $sid${NC}"
    curl -s -X DELETE "$API_URL/sessions/$sid" > /dev/null
done
echo -e "${GREEN}✅ Sessões removidas${NC}"

# 2. Limpar auth_data (CUIDADO!)
echo -e "\n${YELLOW}[2/6]${NC} Limpando credenciais antigas..."
echo -e "${RED}⚠️  Isso vai apagar TODAS as credenciais salvas!${NC}"
echo -e "${YELLOW}Tem certeza? (digite 'SIM' para confirmar)${NC} "
read -r confirm_delete
if [ "$confirm_delete" = "SIM" ]; then
    rm -f /home/anderson/workspace/zaphub/auth_data/session-*.json
    rm -f /home/anderson/workspace/zaphub/auth_data/creds.json
    echo -e "${GREEN}✅ Credenciais antigas removidas${NC}"
else
    echo -e "${YELLOW}⚠️  Pulando limpeza de credenciais${NC}"
fi

# 3. Criar nova sessão
echo -e "\n${YELLOW}[3/6]${NC} Criando nova sessão..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"label\": \"Teste Limpo - $(date +%Y%m%d_%H%M%S)\"}")

NEW_SESSION=$(echo "$CREATE_RESPONSE" | jq -r '.data.id')
echo -e "${GREEN}✅ Sessão criada: $NEW_SESSION${NC}"
echo "$NEW_SESSION" > /tmp/zaphub_session_id.txt

# 4. Aguardar e obter QR
echo -e "\n${YELLOW}[4/6]${NC} Aguardando QR Code (5 segundos)..."
sleep 5

QR_RAW=$(curl -s "$API_URL/sessions/$NEW_SESSION/qr?format=raw" | jq -r '.data.qr_code')

if [ -z "$QR_RAW" ] || [ "$QR_RAW" = "null" ]; then
    echo -e "${RED}❌ Erro ao obter QR Code${NC}"
    exit 1
fi

# 5. Gerar HTML com QR
echo -e "${YELLOW}[5/6]${NC} Gerando QR Code..."

cat > /tmp/zaphub_clean_test.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ZapHub - Conectar WhatsApp</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            max-width: 600px;
            text-align: center;
        }
        h1 { color: #25D366; font-size: 32px; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 30px; font-size: 16px; }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
            border-radius: 5px;
        }
        .warning strong { color: #856404; }
        .qr-wrapper {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 15px;
            margin: 25px 0;
            display: inline-flex;
            justify-content: center;
        }
        #qrcode { border: 3px solid #25D366; border-radius: 10px; padding: 10px; background: white; }
        .timer {
            background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
            color: white;
            padding: 15px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0;
        }
        .instructions {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            border-radius: 8px;
            text-align: left;
            margin: 20px 0;
        }
        .instructions h3 { color: #1976d2; margin-bottom: 15px; }
        .instructions ol { padding-left: 20px; line-height: 1.8; color: #666; }
        .info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 ZapHub - Teste Limpo</h1>
        <div class="subtitle">Conecte seu WhatsApp REMETENTE</div>
        
        <div class="warning">
            <strong>⚠️ IMPORTANTE:</strong><br>
            • Escaneie com o WhatsApp que vai <strong>ENVIAR</strong> mensagens<br>
            • Não com o número de destino (TARGET_PHONE_PLACEHOLDER)
        </div>
        
        <div class="qr-wrapper">
            <div id="qrcode"></div>
        </div>
        
        <div class="timer" id="timer">⏱️ QR Code expira em <span id="seconds">60</span> segundos</div>
        
        <div class="instructions">
            <h3>📋 Como conectar:</h3>
            <ol>
                <li>Abra o <strong>WhatsApp REMETENTE</strong> no celular</li>
                <li>Toque em <strong>Menu (⋮)</strong> ou <strong>Configurações</strong></li>
                <li>Toque em <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Escaneie este QR Code</li>
            </ol>
        </div>
        
        <div class="info">
            <strong>Session ID:</strong> SESSION_ID_PLACEHOLDER<br>
            <strong>Destino da mensagem:</strong> TARGET_PHONE_PLACEHOLDER
        </div>
    </div>
    
    <script>
        // Gerar QR Code
        new QRCode(document.getElementById('qrcode'), {
            text: 'QR_CODE_PLACEHOLDER',
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        
        // Timer
        let seconds = 60;
        setInterval(() => {
            seconds--;
            document.getElementById('seconds').textContent = seconds;
            if (seconds <= 0) {
                document.getElementById('timer').innerHTML = '❌ QR Code EXPIRADO - Recarregue';
                document.getElementById('timer').style.background = '#d32f2f';
            } else if (seconds <= 10) {
                document.getElementById('timer').style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
            }
        }, 1000);
        
        // Auto-refresh status
        setInterval(() => {
            fetch('http://localhost:3001/api/v1/sessions/SESSION_ID_PLACEHOLDER/status')
                .then(r => r.json())
                .then(data => {
                    const phone = data.data.phone_number;
                    if (phone) {
                        document.body.innerHTML = `
                            <div class="container">
                                <div style="font-size: 80px; margin-bottom: 20px;">✅</div>
                                <h1 style="color: #4CAF50;">Conectado!</h1>
                                <p style="margin: 20px 0; color: #666; font-size: 18px;">
                                    WhatsApp conectado com sucesso!
                                </p>
                                <div class="info" style="font-size: 14px;">
                                    <strong>Número conectado:</strong> ${phone}<br>
                                    <strong>Pode fechar esta janela</strong>
                                </div>
                            </div>
                        `;
                    }
                })
                .catch(() => {});
        }, 2000);
    </script>
</body>
</html>
HTMLEOF

# Substituir placeholders
sed -i "s|QR_CODE_PLACEHOLDER|${QR_RAW}|g" /tmp/zaphub_clean_test.html
sed -i "s|SESSION_ID_PLACEHOLDER|${NEW_SESSION}|g" /tmp/zaphub_clean_test.html
sed -i "s|TARGET_PHONE_PLACEHOLDER|${TARGET_PHONE}|g" /tmp/zaphub_clean_test.html

echo -e "${GREEN}✅ QR Code gerado${NC}"

# Abrir navegador
xdg-open /tmp/zaphub_clean_test.html 2>/dev/null || echo -e "${YELLOW}Abra: file:///tmp/zaphub_clean_test.html${NC}"

# 6. Aguardar conexão
echo -e "\n${YELLOW}[6/6]${NC} Aguardando você escanear o QR Code..."
echo -e "${GREEN}📱 Escaneie AGORA com SEU WhatsApp (remetente)!${NC}\n"

for i in {1..30}; do
    sleep 2
    
    # Buscar dados completos da sessão (tem phone_number)
    FULL_DATA=$(curl -s "$API_URL/sessions/$NEW_SESSION")
    STATUS_DATA=$(curl -s "$API_URL/sessions/$NEW_SESSION/status")
    
    PHONE=$(echo "$FULL_DATA" | jq -r '.data.phone_number // empty')
    DB_STATUS=$(echo "$STATUS_DATA" | jq -r '.data.db_status')
    RUNTIME=$(echo "$STATUS_DATA" | jq -r '.data.runtime_status')
    IS_CONNECTED=$(echo "$STATUS_DATA" | jq -r '.data.is_connected')
    
    echo -e "${BLUE}[$i/30]${NC} DB: $DB_STATUS | Runtime: $RUNTIME | Connected: $IS_CONNECTED | Phone: ${PHONE:-'aguardando...'}"
    
    # Verificar QUALQUER indicador de conexão
    if [ "$DB_STATUS" = "connected" ] || [ "$IS_CONNECTED" = "true" ] || [ "$RUNTIME" = "connected" ] || [ -n "$PHONE" ]; then
    # Verificar QUALQUER indicador de conexão
    if [ "$DB_STATUS" = "connected" ] || [ "$IS_CONNECTED" = "true" ] || [ "$RUNTIME" = "connected" ] || [ -n "$PHONE" ]; then
        echo -e "\n${GREEN}🎉 WHATSAPP CONECTADO!${NC}"
        echo -e "${GREEN}📱 DB Status: $DB_STATUS | Runtime: $RUNTIME | Connected: $IS_CONNECTED${NC}"
        
        # Tentar pegar phone_number
        if [ -n "$PHONE" ] && [ "$PHONE" != "null" ]; then
            echo -e "${GREEN}📱 Número conectado: $PHONE${NC}\n"
        else
            echo -e "${YELLOW}⚠️  phone_number ainda não disponível (conexão pode estar instável)${NC}\n"
            PHONE="não disponível"
        fi
        
        # Enviar mensagem de teste
        echo -e "${YELLOW}Enviando mensagem para $TARGET_PHONE...${NC}\n"
        
        MSG_ID="msg-clean-$(date +%s)"
        
        SEND=$(curl -s -X POST "$API_URL/sessions/$NEW_SESSION/messages" \
          -H "Content-Type: application/json" \
          -d "{
            \"messageId\": \"$MSG_ID\",
            \"to\": \"$TARGET_PHONE\",
            \"type\": \"text\",
            \"text\": \"🎉 Teste limpo funcionou!\\n\\nRemetente: $PHONE\\nDestino: $TARGET_PHONE\\nHora: $(date '+%H:%M:%S')\"
          }")
        
        echo "$SEND" | jq '.'
        
        MESSAGE_ID=$(echo "$SEND" | jq -r '.data.id')
        
        echo -e "\n${YELLOW}Aguardando processamento (5 segundos)...${NC}"
        sleep 5
        
        FINAL=$(curl -s "$API_URL/sessions/$NEW_SESSION/messages/$MESSAGE_ID")
        echo -e "\n${GREEN}Status final:${NC}"
        echo "$FINAL" | jq '{status: .data.status, sent_at: .data.sent_at, error: .data.error_message}'
        
        exit 0
    fi
done

echo -e "\n${RED}❌ Timeout - QR Code não foi escaneado em 60 segundos${NC}"
exit 1
