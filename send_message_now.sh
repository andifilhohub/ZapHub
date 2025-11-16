#!/bin/bash

################################################################################
# Enviar mensagem usando sessão já conectada
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
echo -e "${BLUE}  📨 ZapHub - Envio Rápido de Mensagem${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 1. Obter Session ID do arquivo
if [ -f /tmp/zaphub_session_id.txt ]; then
    SESSION_ID=$(cat /tmp/zaphub_session_id.txt)
    echo -e "${GREEN}✓ Session ID encontrado: $SESSION_ID${NC}\n"
else
    echo -e "${RED}❌ Nenhuma sessão encontrada em /tmp/zaphub_session_id.txt${NC}"
    echo -e "${YELLOW}Execute primeiro: ./send_test_message.sh${NC}\n"
    exit 1
fi

# 2. Verificar status da sessão
echo -e "${YELLOW}[1/3]${NC} Verificando status da sessão..."
STATUS_RESPONSE=$(curl -s "$API_URL/sessions/$SESSION_ID/status")

DB_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.db_status')
RUNTIME_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.runtime_status')
IS_CONNECTED=$(echo "$STATUS_RESPONSE" | jq -r '.data.is_connected')
PHONE=$(echo "$STATUS_RESPONSE" | jq -r '.data.phone_number // empty')

echo -e "${BLUE}   DB Status: $DB_STATUS${NC}"
echo -e "${BLUE}   Runtime Status: $RUNTIME_STATUS${NC}"
echo -e "${BLUE}   Is Connected: $IS_CONNECTED${NC}"
echo -e "${BLUE}   Phone: ${PHONE:-'não disponível'}${NC}\n"

# Verificar se está conectado de qualquer forma
CONNECTED=false
if [ "$IS_CONNECTED" = "true" ] || [ "$RUNTIME_STATUS" = "connected" ]; then
    CONNECTED=true
    echo -e "${GREEN}✅ Sessão está conectada no runtime${NC}\n"
elif [ "$DB_STATUS" = "connected" ]; then
    echo -e "${YELLOW}⚠️  Sessão conectada apenas no DB (não no runtime)${NC}"
    echo -e "${YELLOW}   As mensagens podem não ser enviadas!${NC}"
    echo -e "${YELLOW}   Recomendação: Reinicie o worker ou crie nova sessão${NC}\n"
    echo -e "${YELLOW}Tentar enviar mesmo assim? (s/N) ${NC}"
    read -r continue
    if [[ ! "$continue" =~ ^[Ss]$ ]]; then
        exit 1
    fi
    CONNECTED=true
fi

if [ "$CONNECTED" = false ]; then
    echo -e "${RED}❌ Sessão não está conectada!${NC}"
    echo -e "${YELLOW}Execute: ./send_test_message.sh para criar nova sessão${NC}\n"
    exit 1
fi

# 3. Enviar mensagem
echo -e "${YELLOW}[2/3]${NC} Enviando mensagem para $TARGET_PHONE..."

MSG_ID="msg-$(date +%s)-$(shuf -i 1000-9999 -n 1)"

PAYLOAD=$(cat <<EOF
{
  "messageId": "$MSG_ID",
  "to": "$TARGET_PHONE",
  "type": "text",
  "text": "🤖 Mensagem de teste do ZapHub\n\nEnviada em: $(date '+%d/%m/%Y às %H:%M:%S')\n\n✅ Sistema funcionando!"
}
EOF
)

echo -e "${BLUE}Payload:${NC}"
echo "$PAYLOAD" | jq '.'
echo ""

SEND_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$SEND_RESPONSE" | tail -1)
BODY=$(echo "$SEND_RESPONSE" | head -n-1)

echo -e "${YELLOW}[3/3]${NC} Verificando resposta..."

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo -e "${GREEN}✅ Mensagem aceita pela API (HTTP $HTTP_CODE)${NC}\n"
    
    MESSAGE_ID=$(echo "$BODY" | jq -r '.data.id')
    MESSAGE_STATUS=$(echo "$BODY" | jq -r '.data.status')
    JOB_ID=$(echo "$BODY" | jq -r '.data.jobId // empty')
    
    echo -e "${GREEN}Detalhes:${NC}"
    echo "$BODY" | jq '.'
    echo ""
    
    echo -e "${BLUE}Message ID: $MESSAGE_ID${NC}"
    echo -e "${BLUE}Status: $MESSAGE_STATUS${NC}"
    [ -n "$JOB_ID" ] && echo -e "${BLUE}Job ID: $JOB_ID${NC}"
    
    if [ "$MESSAGE_STATUS" = "queued" ] || [ "$MESSAGE_STATUS" = "processing" ]; then
        echo -e "\n${GREEN}✅ Mensagem enfileirada com sucesso!${NC}"
        echo -e "${YELLOW}⏳ Aguarde alguns segundos para a mensagem chegar...${NC}"
        
        if [ "$RUNTIME_STATUS" = "disconnected" ]; then
            echo -e "\n${YELLOW}⚠️  ATENÇÃO: Runtime está desconectado!${NC}"
            echo -e "${YELLOW}   A mensagem está na fila, mas o worker pode não processar.${NC}"
            echo -e "${YELLOW}   Verifique se o worker está rodando: ps aux | grep worker${NC}"
        fi
    else
        echo -e "\n${YELLOW}⚠️  Status: $MESSAGE_STATUS${NC}"
    fi
else
    echo -e "${RED}❌ Erro ao enviar mensagem (HTTP $HTTP_CODE)${NC}\n"
    echo "$BODY" | jq '.'
    exit 1
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Processo concluído!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${YELLOW}💡 Dica: Para verificar se o worker processou:${NC}"
echo -e "${YELLOW}   curl -s '$API_URL/sessions/$SESSION_ID/messages/$MESSAGE_ID' | jq '.'${NC}\n"
