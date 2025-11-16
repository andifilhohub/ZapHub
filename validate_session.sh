#!/bin/bash

################################################################################
# Script de Validação de Sessão ZapHub
################################################################################
# 
# Verifica se uma sessão está realmente conectada e pronta para enviar mensagens
#
# Uso:
#   ./validate_session.sh [SESSION_ID]
#
################################################################################

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:3001/api/v1"
SESSION_ID=$1

if [ -z "$SESSION_ID" ]; then
    # Tentar ler do arquivo temporário
    if [ -f /tmp/zaphub_session_id.txt ]; then
        SESSION_ID=$(cat /tmp/zaphub_session_id.txt)
        echo -e "${BLUE}ℹ Usando Session ID do arquivo: $SESSION_ID${NC}\n"
    else
        echo -e "${RED}❌ Uso: $0 <SESSION_ID>${NC}"
        echo -e "${YELLOW}   ou crie /tmp/zaphub_session_id.txt com o ID da sessão${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🔍 VALIDANDO SESSÃO ZAPHUB${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Session ID:${NC} $SESSION_ID\n"

# 1. Sessão existe?
echo -e "${YELLOW}[1/5]${NC} Verificando se a sessão existe..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/sessions/$SESSION_ID/status")

if [ "$STATUS_CODE" != "200" ]; then
  echo -e "${RED}❌ Sessão não existe ou erro no servidor (HTTP $STATUS_CODE)${NC}\n"
  echo -e "${YELLOW}💡 Soluções:${NC}"
  echo -e "   1. Verifique se o SESSION_ID está correto"
  echo -e "   2. Liste sessões: curl -s http://localhost:3001/api/v1/sessions | jq '.data[] | {id, label}'"
  echo -e "   3. Crie nova sessão: curl -X POST http://localhost:3001/api/v1/sessions -H 'Content-Type: application/json' -d '{\"label\":\"Nova Sessão\"}'"
  exit 1
fi
echo -e "${GREEN}✅ Sessão existe${NC}\n"

# 2. Status detalhado
echo -e "${YELLOW}[2/5]${NC} Obtendo status detalhado..."
RESPONSE=$(curl -s "$API_URL/sessions/$SESSION_ID/status")

if [ -z "$RESPONSE" ]; then
  echo -e "${RED}❌ Resposta vazia da API${NC}"
  exit 1
fi

DB_STATUS=$(echo "$RESPONSE" | jq -r '.data.db_status')
RUNTIME_STATUS=$(echo "$RESPONSE" | jq -r '.data.runtime_status')
IS_CONNECTED=$(echo "$RESPONSE" | jq -r '.data.is_connected')
PHONE=$(echo "$RESPONSE" | jq -r '.data.phone_number // empty')
LABEL=$(echo "$RESPONSE" | jq -r '.data.label // empty')
CONNECTED_AT=$(echo "$RESPONSE" | jq -r '.data.connected_at // empty')

echo -e "${BLUE}📊 Status da Sessão:${NC}"
echo -e "   Label: ${LABEL:-'não definido'}"
echo -e "   DB Status: $DB_STATUS"
echo -e "   Runtime Status: $RUNTIME_STATUS"
echo -e "   Is Connected: $IS_CONNECTED"
echo -e "   Phone: ${PHONE:-'não disponível'}"
[ -n "$CONNECTED_AT" ] && echo -e "   Conectado em: $CONNECTED_AT"
echo ""

# 3. Validações críticas
echo -e "${YELLOW}[3/5]${NC} Executando validações críticas..."
ERRORS=0
WARNINGS=0

# Check 1: Runtime Status
if [ "$RUNTIME_STATUS" != "connected" ]; then
  echo -e "${RED}❌ Runtime NÃO conectado${NC} (runtime_status = '$RUNTIME_STATUS')"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ Runtime conectado${NC}"
fi

# Check 2: is_connected flag
if [ "$IS_CONNECTED" != "true" ]; then
  echo -e "${RED}❌ Flag is_connected = false${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ Flag is_connected = true${NC}"
fi

# Check 3: Phone number
if [ -z "$PHONE" ] || [ "$PHONE" = "null" ]; then
  echo -e "${RED}❌ Número de telefone não disponível${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ Número conectado: $PHONE${NC}"
fi

# Check 4: DB Status consistency
if [ "$DB_STATUS" = "connected" ] && [ "$RUNTIME_STATUS" != "connected" ]; then
  echo -e "${YELLOW}⚠️  INCONSISTÊNCIA: DB conectado mas Runtime desconectado${NC}"
  echo -e "${YELLOW}   Isso indica que a sessão foi conectada mas o worker perdeu a conexão${NC}"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 4. Verificar worker
echo -e "${YELLOW}[4/5]${NC} Verificando se worker está rodando..."
WORKER_PID=$(ps aux | grep "node.*worker" | grep -v grep | awk '{print $2}' | head -1)

if [ -z "$WORKER_PID" ]; then
  echo -e "${RED}❌ Worker NÃO está rodando${NC}"
  echo -e "${YELLOW}   Inicie o worker: node src/workers/index.js${NC}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅ Worker rodando (PID: $WORKER_PID)${NC}"
fi

echo ""

# 5. Verificar API
echo -e "${YELLOW}[5/5]${NC} Verificando saúde da API..."
HEALTH=$(curl -s "$API_URL/health" | jq -r '.status')

if [ "$HEALTH" = "ok" ]; then
  echo -e "${GREEN}✅ API está saudável${NC}"
else
  echo -e "${RED}❌ API com problemas (status: $HEALTH)${NC}"
  ERRORS=$((ERRORS + 1))
fi

# Resultado final
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}🎉 SESSÃO 100% FUNCIONAL!${NC}"
  echo -e "${GREEN}Você pode enviar mensagens agora.${NC}"
  
  if [ $WARNINGS -gt 0 ]; then
    echo -e "\n${YELLOW}⚠️  Avisos: $WARNINGS${NC}"
  fi
  
  echo -e "\n${BLUE}📱 Exemplo de envio:${NC}"
  echo -e "${YELLOW}curl -X POST '$API_URL/sessions/$SESSION_ID/messages' \\
  -H 'Content-Type: application/json' \\
  -d '{
    \"messageId\": \"msg-\$(date +%s)\",
    \"to\": \"5511999999999@s.whatsapp.net\",
    \"type\": \"text\",
    \"text\": \"Olá do ZapHub!\"
  }'${NC}"
  
  exit 0
else
  echo -e "${RED}⚠️  SESSÃO COM $ERRORS ERRO(S)${NC}"
  echo -e "${RED}Mensagens NÃO serão enviadas!${NC}"
  
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Avisos: $WARNINGS${NC}"
  fi
  
  echo -e "\n${YELLOW}💡 SOLUÇÃO RECOMENDADA:${NC}"
  echo -e "\n${YELLOW}1. Deletar esta sessão:${NC}"
  echo -e "   curl -X DELETE '$API_URL/sessions/$SESSION_ID'"
  
  echo -e "\n${YELLOW}2. Criar nova sessão:${NC}"
  echo -e "   curl -X POST '$API_URL/sessions' \\"
  echo -e "     -H 'Content-Type: application/json' \\"
  echo -e "     -d '{\"label\": \"Nova Sessão WhatsApp\"}'"
  
  echo -e "\n${YELLOW}3. Salvar novo SESSION_ID e obter QR Code:${NC}"
  echo -e "   NEW_SESSION_ID=<cole-o-id-aqui>"
  echo -e "   curl -s '$API_URL/sessions/\$NEW_SESSION_ID/qr?format=data_url' | jq -r '.data.qr_code'"
  
  echo -e "\n${YELLOW}4. Escanear QR Code com WhatsApp${NC}"
  
  echo -e "\n${YELLOW}5. Aguardar conexão:${NC}"
  echo -e "   ./validate_session.sh \$NEW_SESSION_ID"
  
  exit 1
fi
