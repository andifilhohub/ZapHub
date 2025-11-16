#!/bin/bash

################################################################################
# Descobrir JID correto de um contato
################################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:3001/api/v1"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🔍 Descobrir JID Correto do Contato${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Ler session_id
if [ -f /tmp/zaphub_session_id.txt ]; then
    SESSION_ID=$(cat /tmp/zaphub_session_id.txt)
    echo -e "${GREEN}✓ Session ID encontrado: $SESSION_ID${NC}\n"
else
    echo -e "${RED}❌ Nenhuma sessão ativa encontrada${NC}"
    echo -e "${YELLOW}Execute primeiro: ./clean_test.sh${NC}"
    exit 1
fi

# Verificar se está conectado
echo -e "${YELLOW}[1/3]${NC} Verificando conexão..."
STATUS=$(curl -s "$API_URL/sessions/$SESSION_ID/status")
PHONE=$(echo "$STATUS" | jq -r '.data.phone_number // empty')
RUNTIME=$(echo "$STATUS" | jq -r '.data.runtime_status')

if [ -z "$PHONE" ] || [ "$PHONE" = "null" ]; then
    echo -e "${RED}❌ Sessão não está conectada!${NC}"
    echo -e "${YELLOW}Execute: ./clean_test.sh e escaneie o QR Code${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Conectado como: $PHONE${NC}\n"

# Buscar contatos
echo -e "${YELLOW}[2/3]${NC} Buscando contatos do WhatsApp..."
echo -e "${BLUE}Digite parte do nome ou número do contato:${NC} "
read -r search_term

echo -e "\n${YELLOW}Procurando por '$search_term'...${NC}\n"

# Listar todos os contatos e filtrar
CONTACTS=$(curl -s "$API_URL/sessions/$SESSION_ID/contacts")

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro ao buscar contatos${NC}"
    exit 1
fi

# Verificar se há contatos
TOTAL=$(echo "$CONTACTS" | jq '.data | length' 2>/dev/null)

if [ -z "$TOTAL" ] || [ "$TOTAL" = "0" ] || [ "$TOTAL" = "null" ]; then
    echo -e "${YELLOW}⚠️  API não retornou contatos ou endpoint não existe${NC}\n"
    echo -e "${BLUE}Vou tentar testar variações comuns do número...${NC}\n"
    
    echo -e "${YELLOW}Digite apenas os números (sem +, sem espaços):${NC}"
    echo -e "${BLUE}Exemplo: 5534996853220${NC} "
    read -r base_number
    
    echo -e "\n${GREEN}Testando variações:${NC}\n"
    
    # Variações comuns
    variations=(
        "${base_number}@s.whatsapp.net"
        "55${base_number#55}@s.whatsapp.net"  # Com +55
        "${base_number#55}@s.whatsapp.net"    # Sem +55
    )
    
    # Se tiver 13 dígitos com 55, testar sem o 9 extra
    if [[ ${base_number} =~ ^55[1-9]{2}9[0-9]{8}$ ]]; then
        # Remove o 9 após DDD
        no_nine=$(echo "$base_number" | sed 's/^\(55[0-9][0-9]\)9/\1/')
        variations+=("${no_nine}@s.whatsapp.net")
    fi
    
    # Se tiver 11 dígitos, adicionar 55
    if [[ ${base_number} =~ ^[1-9]{2}9[0-9]{8}$ ]]; then
        variations+=("55${base_number}@s.whatsapp.net")
    fi
    
    echo -e "${BLUE}Variações que vou testar:${NC}"
    for i in "${!variations[@]}"; do
        echo -e "${YELLOW}$((i+1)).${NC} ${variations[$i]}"
    done
    
    echo -e "\n${GREEN}Copie e cole UM dos JIDs acima para testar${NC}"
    echo -e "${YELLOW}Ou digite 'all' para testar todos automaticamente${NC} "
    read -r choice
    
    if [ "$choice" = "all" ]; then
        echo -e "\n${YELLOW}[3/3]${NC} Enviando mensagem de teste para todas as variações..."
        
        for jid in "${variations[@]}"; do
            echo -e "\n${BLUE}Testando: $jid${NC}"
            
            msg_id="test-$(date +%s)-$(shuf -i 1000-9999 -n 1)"
            
            RESULT=$(curl -s -X POST "$API_URL/sessions/$SESSION_ID/messages" \
              -H "Content-Type: application/json" \
              -d "{
                \"messageId\": \"$msg_id\",
                \"to\": \"$jid\",
                \"type\": \"text\",
                \"text\": \"✅ Teste de JID\\n\\nSe você recebeu esta mensagem, o JID correto é:\\n$jid\"
              }")
            
            STATUS_CODE=$(echo "$RESULT" | jq -r '.statusCode // .status // 0')
            
            if [ "$STATUS_CODE" = "200" ] || [ "$STATUS_CODE" = "201" ]; then
                echo -e "${GREEN}✓ Mensagem enviada com sucesso!${NC}"
                echo -e "${YELLOW}Verifique seu WhatsApp - qual conversa recebeu a mensagem?${NC}"
            else
                ERROR=$(echo "$RESULT" | jq -r '.message // .error // "Erro desconhecido"')
                echo -e "${RED}✗ Falhou: $ERROR${NC}"
            fi
            
            sleep 2
        done
        
        echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}Verifique qual conversa recebeu a mensagem!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "\n${GREEN}JID selecionado para testes futuros:${NC}"
        echo -e "${BLUE}${variations[$((choice-1))]}${NC}"
        echo "${variations[$((choice-1))]}" > /tmp/zaphub_correct_jid.txt
        echo -e "\n${YELLOW}Salvo em: /tmp/zaphub_correct_jid.txt${NC}"
    fi
    
else
    # Filtrar contatos
    echo "$CONTACTS" | jq -r ".data[] | select(.name // .notify | test(\"$search_term\"; \"i\")) | 
        \"${GREEN}✓${NC} \(.name // .notify // \"Sem nome\") 
        ${BLUE}JID:${NC} \(.id)
        ${YELLOW}Phone:${NC} \(.number // \"N/A\")
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\"" | head -20
    
    echo -e "\n${GREEN}Use o JID completo (xxx@s.whatsapp.net) para enviar mensagens${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}💡 Dica:${NC} Números brasileiros geralmente são:"
echo -e "${YELLOW}   • Com 9 extra:${NC} 55 + DDD (2 dígitos) + 9 + número (8 dígitos)"
echo -e "${YELLOW}   • Exemplo:${NC} 5534996853220@s.whatsapp.net"
echo -e "${YELLOW}   • Sem 9:${NC} 553496853220@s.whatsapp.net (celulares antigos)"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
