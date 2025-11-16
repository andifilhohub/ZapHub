#!/bin/bash

################################################################################
# Script Rápido de Teste de Envio - ZapHub
################################################################################

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:3001/api/v1"
TARGET_PHONE="${1:-5534996853220@s.whatsapp.net}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  📱 ZapHub - Teste de Envio de Mensagem${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 1. Criar sessão
echo -e "${YELLOW}[1/5]${NC} Criando nova sessão..."
RESPONSE=$(curl -s -X POST "$API_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"label\": \"Teste $(date +%Y%m%d_%H%M%S)\", \"webhook_url\": \"https://webhook.site/test\"}")

SESSION_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  echo -e "${RED}❌ Erro ao criar sessão${NC}"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Sessão criada: $SESSION_ID${NC}\n"
echo "$SESSION_ID" > /tmp/zaphub_session_id.txt

# 2. Aguardar worker processar
echo -e "${YELLOW}[2/5]${NC} Aguardando worker processar (5 segundos)..."
sleep 5

# 3. Obter QR Code (formato RAW)
echo -e "${YELLOW}[3/5]${NC} Obtendo QR Code..."
QR_RESPONSE=$(curl -s "$API_URL/sessions/$SESSION_ID/qr?format=raw")
QR_CODE=$(echo "$QR_RESPONSE" | jq -r '.data.qr_code')

if [ -z "$QR_CODE" ] || [ "$QR_CODE" = "null" ]; then
  echo -e "${RED}❌ Erro ao obter QR Code${NC}"
  echo "$QR_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ QR Code obtido (${#QR_CODE} caracteres)${NC}\n"

# 4. Criar HTML com QR Code
echo -e "${YELLOW}[4/5]${NC} Gerando HTML com QR Code..."

cat > /tmp/zaphub_qr_final.html << 'HTMLEND'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZapHub - Conectar WhatsApp</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
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
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        
        .logo {
            font-size: 48px;
            margin-bottom: 10px;
        }
        
        h1 {
            color: #25D366;
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .subtitle {
            color: #666;
            font-size: 16px;
            margin-bottom: 30px;
        }
        
        .qr-wrapper {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 25px;
            display: inline-flex;
            justify-content: center;
            align-items: center;
        }
        
        #qrcode {
            border: 3px solid #25D366;
            border-radius: 10px;
            padding: 10px;
            background: white;
        }
        
        #qrcode canvas,
        #qrcode img {
            display: block !important;
            margin: 0 auto;
        }
        
        .timer {
            background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
            color: white;
            padding: 15px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 25px;
        }
        
        .instructions {
            background: #f0f9ff;
            border-left: 4px solid #25D366;
            padding: 20px;
            border-radius: 8px;
            text-align: left;
            margin-bottom: 20px;
        }
        
        .instructions h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 16px;
        }
        
        .instructions ol {
            color: #666;
            line-height: 1.8;
            padding-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 8px;
        }
        
        .info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            color: #666;
            font-family: 'Courier New', monospace;
        }
        
        .status {
            display: inline-block;
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border-radius: 20px;
            font-size: 14px;
            margin-bottom: 20px;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        .qr-wrapper {
            animation: pulse 2s ease-in-out infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">📱</div>
        <h1>ZapHub WhatsApp</h1>
        <div class="subtitle">Conecte seu WhatsApp em segundos</div>
        
        <div class="status">✓ Sessão Ativa</div>
        
        <div class="qr-wrapper">
            <div id="qrcode"></div>
        </div>
        
        <div class="timer" id="timer">
            ⏱️ QR Code expira em <span id="seconds">60</span> segundos
        </div>
        
        <div class="instructions">
            <h3>📋 Como conectar:</h3>
            <ol>
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Toque em <strong>Menu (⋮)</strong> ou <strong>Configurações</strong></li>
                <li>Toque em <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Aponte a câmera para este <strong>QR Code</strong></li>
            </ol>
        </div>
        
        <div class="info">
            <strong>Session ID:</strong><br>
            SESSION_ID_PLACEHOLDER<br><br>
            <strong>Número de teste:</strong><br>
            TARGET_PHONE_PLACEHOLDER
        </div>
    </div>
    
    <script>
        // Gerar QR Code a partir do texto
        const qrText = 'QR_CODE_PLACEHOLDER';
        new QRCode(document.getElementById('qrcode'), {
            text: qrText,
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        
        // Timer
        let seconds = 60;
        const timerEl = document.getElementById('timer');
        const secondsEl = document.getElementById('seconds');
        
        setInterval(() => {
            seconds--;
            secondsEl.textContent = seconds;
            
            if (seconds <= 0) {
                timerEl.innerHTML = '❌ QR Code EXPIRADO - Recarregue a página';
                timerEl.style.background = 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)';
            } else if (seconds <= 10) {
                timerEl.style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
            }
        }, 1000);
        
        // Auto-refresh status
        setInterval(() => {
            fetch('http://localhost:3001/api/v1/sessions/SESSION_ID_PLACEHOLDER/status')
                .then(r => r.json())
                .then(data => {
                    if (data.data.is_connected || data.data.runtime_status === 'connected') {
                        document.body.innerHTML = `
                            <div class="container">
                                <div style="font-size: 80px; margin-bottom: 20px;">✅</div>
                                <h1 style="color: #4CAF50;">Conectado com Sucesso!</h1>
                                <p style="margin: 20px 0; color: #666;">
                                    Seu WhatsApp está conectado.<br>
                                    Você pode fechar esta janela.
                                </p>
                                <div class="info">
                                    <strong>Telefone:</strong> ${data.data.phone_number || 'Carregando...'}
                                </div>
                            </div>
                        `;
                    }
                })
                .catch(e => console.log('Verificando status...'));
        }, 3000);
    </script>
</body>
</html>
HTMLEND

# Substituir placeholders
sed -i "s|QR_CODE_PLACEHOLDER|${QR_CODE}|g" /tmp/zaphub_qr_final.html
sed -i "s|SESSION_ID_PLACEHOLDER|${SESSION_ID}|g" /tmp/zaphub_qr_final.html
sed -i "s|TARGET_PHONE_PLACEHOLDER|${TARGET_PHONE}|g" /tmp/zaphub_qr_final.html

echo -e "${GREEN}✅ HTML criado: /tmp/zaphub_qr_final.html${NC}\n"

# 5. Abrir no navegador
echo -e "${YELLOW}[5/5]${NC} Abrindo QR Code no navegador..."
if command -v xdg-open &> /dev/null; then
    xdg-open /tmp/zaphub_qr_final.html &> /dev/null &
    echo -e "${GREEN}✅ Navegador aberto${NC}\n"
elif command -v firefox &> /dev/null; then
    firefox /tmp/zaphub_qr_final.html &> /dev/null &
    echo -e "${GREEN}✅ Firefox aberto${NC}\n"
else
    echo -e "${YELLOW}ℹ Abra manualmente: file:///tmp/zaphub_qr_final.html${NC}\n"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ QR Code pronto!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}📱 ESCANEIE O QR CODE AGORA!${NC}\n"
echo -e "Aguardando conexão (pressione Ctrl+C para cancelar)...\n"

# Polling de conexão
for i in {1..20}; do
    sleep 3
    FULL_STATUS=$(curl -s "$API_URL/sessions/$SESSION_ID/status")
    
    DB_STATUS=$(echo "$FULL_STATUS" | jq -r '.data.db_status')
    RUNTIME_STATUS=$(echo "$FULL_STATUS" | jq -r '.data.runtime_status')
    IS_CONNECTED=$(echo "$FULL_STATUS" | jq -r '.data.is_connected')
    PHONE=$(echo "$FULL_STATUS" | jq -r '.data.phone_number // empty')
    
    echo -e "${BLUE}[$i/20]${NC} DB: $DB_STATUS | Runtime: $RUNTIME_STATUS | Connected: $IS_CONNECTED | Phone: ${PHONE:-'aguardando...'}"
    
    # Considerar conectado se:
    # 1. is_connected = true OU
    # 2. db_status = "connected" E tem phone_number OU
    # 3. runtime_status = "connected"
    if [ "$IS_CONNECTED" = "true" ] || [ "$RUNTIME_STATUS" = "connected" ] || ([ "$DB_STATUS" = "connected" ] && [ -n "$PHONE" ]); then
        echo -e "\n${GREEN}✅ WHATSAPP CONECTADO!${NC}"
        echo -e "${GREEN}📱 DB Status: $DB_STATUS${NC}"
        echo -e "${GREEN}📱 Runtime Status: $RUNTIME_STATUS${NC}"
        [ -n "$PHONE" ] && echo -e "${GREEN}📱 Número: $PHONE${NC}"
        echo ""
        
        # Enviar mensagem de teste
        echo -e "${YELLOW}Enviando mensagem de teste para $TARGET_PHONE...${NC}\n"
        
        MSG_ID="msg-$(date +%s)-test"
        
        SEND_RESPONSE=$(curl -s -X POST "$API_URL/sessions/$SESSION_ID/messages" \
          -H "Content-Type: application/json" \
          -d "{
            \"messageId\": \"$MSG_ID\",
            \"to\": \"$TARGET_PHONE\",
            \"type\": \"text\",
            \"text\": \"🤖 Mensagem de teste do ZapHub\\n\\nEnviada em: $(date '+%d/%m/%Y às %H:%M:%S')\\n\\nSe você recebeu esta mensagem, o sistema está funcionando perfeitamente! ✅\"
          }")
        
        echo -e "${GREEN}Resposta da API:${NC}"
        echo "$SEND_RESPONSE" | jq '.'
        
        MESSAGE_STATUS=$(echo "$SEND_RESPONSE" | jq -r '.data.status')
        
        if [ "$MESSAGE_STATUS" = "queued" ] || [ "$MESSAGE_STATUS" = "processing" ]; then
            echo -e "\n${GREEN}✅ Mensagem enfileirada com sucesso!${NC}"
            echo -e "${YELLOW}Aguarde alguns segundos para a mensagem chegar no WhatsApp...${NC}\n"
        else
            echo -e "\n${YELLOW}⚠️ Status da mensagem: $MESSAGE_STATUS${NC}\n"
        fi
        
        exit 0
    fi
done

echo -e "\n${RED}❌ Timeout: WhatsApp não foi conectado em 60 segundos${NC}"
echo -e "${YELLOW}O QR Code pode ter expirado. Execute o script novamente.${NC}\n"
exit 1
