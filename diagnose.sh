#!/bin/bash

################################################################################
# Diagnóstico e Correção de Erros - ZapHub
################################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🔧 ZapHub - Diagnóstico de Erros${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# 1. Verificar processos duplicados
echo -e "${YELLOW}[1/5]${NC} Verificando processos Node duplicados..."
# Filtrar apenas processos REAIS do ZapHub (não VS Code)
NODE_PROCS=$(ps aux | grep -E "node.*src/server/app.js|node.*src/worker" | grep -v grep | wc -l)

if [ "$NODE_PROCS" -gt 2 ]; then
    echo -e "${RED}⚠️  Encontrados $NODE_PROCS processos ZapHub (esperado: 1-2)${NC}"
    echo -e "${YELLOW}Processos:${NC}"
    ps aux | grep -E "node.*src/server/app.js|node.*src/worker" | grep -v grep
    echo ""
    echo -e "${YELLOW}Deseja matar e reiniciar? (s/N)${NC} "
    read -r kill_procs
    if [[ "$kill_procs" =~ ^[Ss]$ ]]; then
        # Matar apenas processos específicos do ZapHub
        ps aux | grep -E "node.*src/server/app.js|node.*src/worker" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
        echo -e "${GREEN}✅ Processos ZapHub encerrados${NC}"
        sleep 2
    fi
elif [ "$NODE_PROCS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Nenhum processo ZapHub rodando${NC}"
else
    echo -e "${GREEN}✅ Processos ZapHub OK ($NODE_PROCS)${NC}"
fi

# 2. Verificar credenciais no auth_data
echo -e "\n${YELLOW}[2/5]${NC} Verificando credenciais duplicadas..."
cd /home/anderson/workspace/zaphub/auth_data 2>/dev/null || {
    echo -e "${RED}❌ Diretório auth_data não encontrado${NC}"
    exit 1
}

SESSION_FILES=$(ls -1 session-*.json 2>/dev/null | wc -l)
CREDS_FILES=$(ls -1 creds.json 2>/dev/null | wc -l)

echo -e "${BLUE}📂 auth_data/:${NC}"
echo -e "   Sessions: $SESSION_FILES arquivos"
echo -e "   Credentials: $CREDS_FILES arquivo(s)"

if [ "$SESSION_FILES" -gt 1 ]; then
    echo -e "\n${YELLOW}⚠️  Múltiplas sessões encontradas:${NC}"
    ls -lh session-*.json | awk '{print "   "$9, "("$5", "$6" "$7")"}'
    
    echo -e "\n${RED}Isso pode causar PreKeyError!${NC}"
    echo -e "${YELLOW}Deseja fazer backup e limpar? (s/N)${NC} "
    read -r clean_auth
    if [[ "$clean_auth" =~ ^[Ss]$ ]]; then
        # Backup
        BACKUP_DIR="/tmp/zaphub_backup_$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        cp -r /home/anderson/workspace/zaphub/auth_data/* "$BACKUP_DIR/"
        echo -e "${GREEN}✅ Backup criado em: $BACKUP_DIR${NC}"
        
        # Limpar
        rm -f /home/anderson/workspace/zaphub/auth_data/session-*.json
        rm -f /home/anderson/workspace/zaphub/auth_data/pre-key-*.json
        echo -e "${GREEN}✅ Credenciais limpas (backup mantido)${NC}"
    fi
fi

# 3. Verificar sessões no banco
echo -e "\n${YELLOW}[3/5]${NC} Verificando sessões no banco de dados..."
API_URL="http://localhost:3001/api/v1"

# Tentar acessar API
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ API não está rodando${NC}"
    echo -e "${YELLOW}Iniciando API...${NC}"
    cd /home/anderson/workspace/zaphub
    npm start > /tmp/zaphub.log 2>&1 &
    sleep 5
fi

SESSIONS=$(curl -s "$API_URL/sessions" 2>/dev/null)
if [ $? -eq 0 ]; then
    TOTAL=$(echo "$SESSIONS" | jq '.data | length' 2>/dev/null)
    echo -e "${BLUE}Total de sessões no DB: $TOTAL${NC}"
    
    # Listar sessões com problemas
    echo "$SESSIONS" | jq -r '.data[] | select(.status == "connected" and (.phone_number == null or .phone_number == "")) | 
        "\n⚠️  Sessão com problema:\n   ID: \(.id)\n   Label: \(.label)\n   Status: \(.status)\n   Phone: \(.phone_number // "null")"'
    
    # Contar sessões problemáticas
    PROBLEM_SESSIONS=$(echo "$SESSIONS" | jq '[.data[] | select(.status == "connected" and (.phone_number == null or .phone_number == ""))] | length' 2>/dev/null)
    
    if [ "$PROBLEM_SESSIONS" -gt 0 ]; then
        echo -e "\n${RED}❌ Encontradas $PROBLEM_SESSIONS sessão(ões) com status 'connected' mas phone_number null${NC}"
        echo -e "${YELLOW}Deseja deletar sessões problemáticas? (s/N)${NC} "
        read -r delete_sessions
        if [[ "$delete_sessions" =~ ^[Ss]$ ]]; then
            echo "$SESSIONS" | jq -r '.data[] | select(.status == "connected" and (.phone_number == null or .phone_number == "")) | .id' | while read -r sid; do
                echo -e "${YELLOW}Deletando sessão: $sid${NC}"
                curl -s -X DELETE "$API_URL/sessions/$sid" > /dev/null
                echo -e "${GREEN}✅ Deletada${NC}"
            done
        fi
    fi
else
    echo -e "${RED}❌ Não foi possível acessar a API${NC}"
fi

# 4. Verificar webhook
echo -e "\n${YELLOW}[4/5]${NC} Verificando configuração de webhook..."

WEBHOOK_URL=$(curl -s "$API_URL/sessions" 2>/dev/null | jq -r '.data[0].webhook_url // empty')

if [ -n "$WEBHOOK_URL" ] && [ "$WEBHOOK_URL" != "null" ]; then
    echo -e "${BLUE}Webhook configurado: $WEBHOOK_URL${NC}"
    
    # Testar webhook
    echo -e "${YELLOW}Testando webhook...${NC}"
    TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{"event":"test","data":{"message":"ZapHub diagnostic test"}}' 2>/dev/null)
    
    HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -1)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo -e "${GREEN}✅ Webhook respondendo (HTTP $HTTP_CODE)${NC}"
    elif [ "$HTTP_CODE" = "500" ]; then
        echo -e "${RED}❌ Webhook retornando erro 500!${NC}"
        echo -e "${YELLOW}Resposta:${NC}"
        echo "$TEST_RESPONSE" | head -n-1
        echo -e "\n${YELLOW}💡 Dica: Verifique o servidor webhook ou remova a configuração${NC}"
    else
        echo -e "${YELLOW}⚠️  Webhook retornou HTTP $HTTP_CODE${NC}"
    fi
else
    echo -e "${GREEN}✅ Nenhum webhook configurado${NC}"
fi

# 5. Recomendações
echo -e "\n${YELLOW}[5/5]${NC} Recomendações:"
echo ""
echo -e "${BLUE}📋 Para resolver PreKeyError:${NC}"
echo -e "   1. Pare TODOS os processos Node do ZapHub"
echo -e "   2. Limpe o auth_data/ (backup antes!)"
echo -e "   3. Delete sessões com phone_number=null"
echo -e "   4. Crie nova sessão e escaneie QR Code"
echo ""
echo -e "${BLUE}📋 Para resolver Webhook 500:${NC}"
echo -e "   1. Verifique o servidor webhook"
echo -e "   2. Ou remova webhook_url das sessões:"
echo -e "      ${YELLOW}curl -X PUT $API_URL/sessions/SESSION_ID \\${NC}"
echo -e "      ${YELLOW}  -H 'Content-Type: application/json' \\${NC}"
echo -e "      ${YELLOW}  -d '{\"webhook_url\": null}'${NC}"
echo ""
echo -e "${BLUE}📋 Script de teste limpo:${NC}"
echo -e "   ${GREEN}./clean_test.sh${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Diagnóstico concluído!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
