#!/bin/bash

################################################################################
# ZapHub API - Script de Teste Completo
################################################################################
# 
# Este script testa todos os endpoints da API ZapHub
# 
# Uso:
#   chmod +x test_api.sh
#   ./test_api.sh
#
# Requisitos:
#   - curl
#   - jq (para parsing JSON)
#
################################################################################

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configurações
API_URL="http://localhost:3001/api/v1"
WEBHOOK_URL="https://webhook.site/test-zaphub"
# IMPORTANTE: Formato brasileiro SEM o 9 extra após DDD
# Exemplo: 55 + 34 + 96853220 = 553496853220@s.whatsapp.net
TEST_PHONE="553496853220@s.whatsapp.net"

# Variáveis globais
SESSION_ID=""
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

################################################################################
# Funções Auxiliares
################################################################################

print_header() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_test() {
    TEST_COUNT=$((TEST_COUNT + 1))
    echo -e "${BLUE}[TEST $TEST_COUNT]${NC} $1"
}

print_success() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "${GREEN}✓ PASS:${NC} $1"
}

print_error() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "${RED}✗ FAIL:${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ INFO:${NC} $1"
}

print_data() {
    echo -e "${PURPLE}  → $1${NC}"
}

check_dependencies() {
    print_header "Verificando Dependências"
    
    if ! command -v curl &> /dev/null; then
        print_error "curl não está instalado"
        exit 1
    fi
    print_success "curl instalado"
    
    if ! command -v jq &> /dev/null; then
        print_error "jq não está instalado (sudo apt install jq)"
        exit 1
    fi
    print_success "jq instalado"
    
    # qrencode é opcional mas recomendado para exibir QR no terminal
    if ! command -v qrencode &> /dev/null; then
        print_info "qrencode não instalado (opcional)"
        print_info "Para exibir QR no terminal: sudo apt install qrencode"
    else
        print_success "qrencode instalado"
    fi
}

display_qr_in_terminal() {
    local qr_text=$1
    
    if command -v qrencode &> /dev/null; then
        echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
        
        # Gerar QR code no terminal
        echo "$qr_text" | qrencode -t ANSIUTF8
        
        echo -e "\n${YELLOW}⏱️  O QR Code expira em 60 segundos!${NC}"
        echo -e "${CYAN}Abra o WhatsApp → Menu (3 pontos) → Aparelhos conectados → Conectar${NC}\n"
    else
        print_info "qrencode não disponível. Use o HTML: file:///tmp/zaphub_qr.html"
    fi
}

open_qr_in_browser() {
    local html_file=$1
    
    print_info "Tentando abrir QR no navegador..."
    
    # Tentar abrir no navegador padrão
    if command -v xdg-open &> /dev/null; then
        xdg-open "$html_file" &> /dev/null &
        print_success "QR Code aberto no navegador"
    elif command -v firefox &> /dev/null; then
        firefox "$html_file" &> /dev/null &
        print_success "QR Code aberto no Firefox"
    elif command -v google-chrome &> /dev/null; then
        google-chrome "$html_file" &> /dev/null &
        print_success "QR Code aberto no Chrome"
    else
        print_info "Navegador não detectado. Abra manualmente: file://$html_file"
    fi
}

wait_with_dots() {
    local seconds=$1
    local message=$2
    echo -n -e "${YELLOW}$message${NC}"
    for i in $(seq 1 $seconds); do
        echo -n "."
        sleep 1
    done
    echo -e "${GREEN} OK${NC}"
}

################################################################################
# Testes de Endpoints
################################################################################

test_health_check() {
    print_header "1. HEALTH CHECK"
    print_test "GET /health"
    
    response=$(curl -s -w "\n%{http_code}" "$API_URL/health")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ]; then
        print_success "API está online (HTTP $http_code)"
        
        status=$(echo "$body" | jq -r '.status')
        service=$(echo "$body" | jq -r '.service')
        version=$(echo "$body" | jq -r '.version')
        
        print_data "Status: $status"
        print_data "Service: $service"
        print_data "Version: $version"
    else
        print_error "API não está respondendo (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        exit 1
    fi
}

test_create_session() {
    print_header "2. CRIAR SESSÃO"
    print_test "POST /sessions"
    
    timestamp=$(date +%s)
    payload=$(cat <<EOF
{
  "label": "Teste Automatizado - $timestamp",
  "webhook_url": "$WEBHOOK_URL"
}
EOF
)
    
    print_info "Payload:"
    echo "$payload" | jq '.'
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 201 ]; then
        print_success "Sessão criada com sucesso (HTTP $http_code)"
        
        SESSION_ID=$(echo "$body" | jq -r '.data.id')
        label=$(echo "$body" | jq -r '.data.label')
        status=$(echo "$body" | jq -r '.data.status')
        
        print_data "Session ID: $SESSION_ID"
        print_data "Label: $label"
        print_data "Status: $status"
        
        # Salvar session_id em arquivo
        echo "$SESSION_ID" > /tmp/zaphub_session_id.txt
    else
        print_error "Falha ao criar sessão (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        exit 1
    fi
}

test_list_sessions() {
    print_header "3. LISTAR SESSÕES"
    print_test "GET /sessions"
    
    response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ]; then
        print_success "Sessões listadas com sucesso (HTTP $http_code)"
        
        count=$(echo "$body" | jq '.data | length')
        print_data "Total de sessões: $count"
        
        echo "$body" | jq '.data[] | {id, label, status}' 2>/dev/null
    else
        print_error "Falha ao listar sessões (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_get_qr_code() {
    print_header "4. OBTER QR CODE"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    wait_with_dots 5 "Aguardando worker processar sessão"
    
    # Teste 1: Raw
    print_test "GET /sessions/$SESSION_ID/qr?format=raw"
    response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions/$SESSION_ID/qr?format=raw")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ]; then
        print_success "QR Code obtido em formato RAW (HTTP $http_code)"
        qr_raw=$(echo "$body" | jq -r '.data.qr_code')
        print_data "QR Code (primeiros 50 chars): ${qr_raw:0:50}..."
    else
        print_error "Falha ao obter QR Code RAW (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    
    # Teste 2: Base64
    print_test "GET /sessions/$SESSION_ID/qr?format=base64"
    response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions/$SESSION_ID/qr?format=base64")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ]; then
        print_success "QR Code obtido em formato BASE64 (HTTP $http_code)"
        qr_base64=$(echo "$body" | jq -r '.data.qr_code')
        print_data "QR Code Base64 (primeiros 50 chars): ${qr_base64:0:50}..."
    else
        print_error "Falha ao obter QR Code BASE64 (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    
    # Teste 3: Data URL
    print_test "GET /sessions/$SESSION_ID/qr?format=data_url"
    response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions/$SESSION_ID/qr?format=data_url")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ]; then
        print_success "QR Code obtido em formato DATA_URL (HTTP $http_code)"
        qr_data_url=$(echo "$body" | jq -r '.data.qr_code')
        print_data "QR Code Data URL (primeiros 70 chars): ${qr_data_url:0:70}..."
        
        # Salvar QR em HTML para visualização
        cat > /tmp/zaphub_qr.html <<EOF
<!DOCTYPE html>
<html>
<head>
    <title>ZapHub QR Code</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: #f5f5f5;
        }
        .qr-container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            display: inline-block;
        }
        h1 { color: #25D366; }
        img { max-width: 400px; }
        .info { 
            margin-top: 20px; 
            color: #666;
            font-size: 14px;
        }
        .timer {
            margin-top: 15px;
            color: #f44336;
            font-size: 18px;
            font-weight: bold;
        }
    </style>
    <script>
        let seconds = 60;
        setInterval(() => {
            seconds--;
            if (seconds > 0) {
                document.getElementById('timer').textContent = 
                    'QR expira em ' + seconds + ' segundos';
            } else {
                document.getElementById('timer').textContent = 
                    'QR EXPIRADO - Gere um novo';
                document.getElementById('timer').style.color = '#f44336';
            }
        }, 1000);
    </script>
</head>
<body>
    <div class="qr-container">
        <h1>📱 ZapHub QR Code</h1>
        <img src="$qr_data_url" alt="QR Code">
        <div class="info">
            Session ID: $SESSION_ID<br>
            <strong>Escaneie com WhatsApp</strong>
        </div>
        <div class="timer" id="timer">QR expira em 60 segundos</div>
    </div>
</body>
</html>
EOF
        print_info "QR Code HTML salvo em: /tmp/zaphub_qr.html"
        
        # Tentar exibir QR no terminal
        display_qr_in_terminal "$qr_raw"
        
        # Tentar abrir no navegador automaticamente
        open_qr_in_browser "/tmp/zaphub_qr.html"
        
        print_info "\n${YELLOW}Manualmente:${NC} file:///tmp/zaphub_qr.html"
    else
        print_error "Falha ao obter QR Code DATA_URL (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_check_status() {
    print_header "5. AGUARDAR CONEXÃO"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    print_info "📱 Escaneie o QR Code com seu WhatsApp agora!"
    print_info "⏳ Aguardando conexão... (timeout: 60 segundos)"
    echo ""
    
    # Polling: verificar a cada 3 segundos por até 60 segundos (20 tentativas)
    local max_attempts=20
    local attempt=1
    local connected=false
    
    while [ $attempt -le $max_attempts ]; do
        print_test "Tentativa $attempt/$max_attempts - GET /sessions/$SESSION_ID/status"
        
        response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions/$SESSION_ID/status")
        http_code=$(echo "$response" | tail -1)
        body=$(echo "$response" | head -n-1)
        
        if [ "$http_code" -eq 200 ]; then
            db_status=$(echo "$body" | jq -r '.data.db_status')
            runtime_status=$(echo "$body" | jq -r '.data.runtime_status')
            is_connected=$(echo "$body" | jq -r '.data.is_connected')
            has_qr=$(echo "$body" | jq -r '.data.has_qr_code')
            phone=$(echo "$body" | jq -r '.data.phone_number // .data.label')
            connected_at=$(echo "$body" | jq -r '.data.connected_at')
            
            print_data "DB: $db_status | Runtime: $runtime_status | is_connected: $is_connected"
            
            # Considerar conectado se:
            # 1. is_connected = true OU
            # 2. db_status = "connected" OU  
            # 3. runtime_status = "connected"
            if [ "$is_connected" = "true" ] || [ "$db_status" = "connected" ] || [ "$runtime_status" = "connected" ]; then
                connected=true
                print_success "✅ WhatsApp CONECTADO!"
                [ "$phone" != "null" ] && print_data "📱 Número/Label: $phone"
                print_data "DB Status: $db_status"
                print_data "Runtime Status: $runtime_status"
                [ "$connected_at" != "null" ] && print_data "Conectado em: $connected_at"
                break
            else
                if [ $attempt -lt $max_attempts ]; then
                    echo -n -e "${YELLOW}Aguardando conexão"
                    for i in {1..3}; do
                        echo -n "."
                        sleep 1
                    done
                    echo -e "${NC}"
                fi
            fi
        else
            print_error "Falha ao obter status (HTTP $http_code)"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        fi
        
        attempt=$((attempt + 1))
    done
    
    if [ "$connected" = false ]; then
        print_error "❌ Timeout: WhatsApp não foi conectado em 60 segundos"
        print_info "QR Code pode ter expirado. Delete a sessão e crie uma nova."
        return 1
    fi
}

test_send_text_message() {
    print_header "6. ENVIAR MENSAGEM DE TEXTO"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    # Verificar status da sessão antes de enviar
    print_test "Verificando status da sessão antes de enviar..."
    response=$(curl -s -w "\n%{http_code}" "$API_URL/sessions/$SESSION_ID/status")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -ne 200 ]; then
        print_error "Sessão não encontrada ou erro ao verificar status (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    db_status=$(echo "$body" | jq -r '.data.db_status')
    runtime_status=$(echo "$body" | jq -r '.data.runtime_status')
    is_connected=$(echo "$body" | jq -r '.data.is_connected')
    phone=$(echo "$body" | jq -r '.data.phone_number // "não disponível"')
    
    print_data "Status: DB=$db_status | Runtime=$runtime_status | Connected=$is_connected"
    print_data "Telefone conectado: $phone"
    
    # AVISAR se sessão não está realmente conectada no runtime
    if [ "$runtime_status" != "connected" ] && [ "$is_connected" != "true" ]; then
        print_error "⚠️  ATENÇÃO: Sessão NÃO está conectada no runtime!"
        print_error "   Mensagens NÃO serão enviadas mesmo que db_status mostre 'connected'"
        print_error "   Você precisa:"
        print_error "   1. Deletar esta sessão"
        print_error "   2. Criar uma nova sessão"
        print_error "   3. Escanear o QR Code novamente"
        print_info "Continuar mesmo assim para demonstrar o erro? (s/N)"
        read -r continue_anyway
        if [[ ! "$continue_anyway" =~ ^[Ss]$ ]]; then
            return 1
        fi
    fi
    
    print_test "POST /sessions/$SESSION_ID/messages (text)"
    print_info "Enviando para: $TEST_PHONE"
    
    # Gerar messageId único
    msg_id="msg-$(date +%s)-$(shuf -i 1000-9999 -n 1)"
    
    payload=$(cat <<EOF
{
  "messageId": "$msg_id",
  "to": "$TEST_PHONE",
  "type": "text",
  "text": "🤖 Mensagem de teste automático do ZapHub\n\nTimestamp: $(date '+%Y-%m-%d %H:%M:%S')"
}
EOF
)
    
    print_info "Payload:"
    echo "$payload" | jq '.'
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions/$SESSION_ID/messages" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        print_success "Mensagem enviada com sucesso (HTTP $http_code)"
        message_id=$(echo "$body" | jq -r '.data.id // .data.message_id // "N/A"')
        print_data "Message ID: $message_id"
    else
        print_error "Falha ao enviar mensagem (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_send_image() {
    print_header "7. ENVIAR IMAGEM"
    print_test "POST /sessions/$SESSION_ID/messages (image)"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    # Gerar messageId único
    msg_id="msg-$(date +%s)-$(shuf -i 1000-9999 -n 1)"
    
    payload=$(cat <<EOF
{
  "messageId": "$msg_id",
  "to": "$TEST_PHONE",
  "type": "image",
  "image": {
    "url": "https://picsum.photos/800/600",
    "caption": "📸 Imagem de teste - ZapHub API"
  }
}
EOF
)
    
    print_info "Payload:"
    echo "$payload" | jq '.'
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions/$SESSION_ID/messages" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        print_success "Imagem enviada com sucesso (HTTP $http_code)"
    else
        print_error "Falha ao enviar imagem (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_send_document() {
    print_header "8. ENVIAR DOCUMENTO"
    print_test "POST /sessions/$SESSION_ID/messages (document)"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    # Gerar messageId único
    msg_id="msg-$(date +%s)-$(shuf -i 1000-9999 -n 1)"
    
    payload=$(cat <<EOF
{
  "messageId": "$msg_id",
  "to": "$TEST_PHONE",
  "type": "document",
  "document": {
    "url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    "fileName": "teste-zaphub.pdf",
    "caption": "📄 Documento de teste"
  }
}
EOF
)
    
    print_info "Payload:"
    echo "$payload" | jq '.'
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions/$SESSION_ID/messages" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        print_success "Documento enviado com sucesso (HTTP $http_code)"
    else
        print_error "Falha ao enviar documento (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_send_location() {
    print_header "9. ENVIAR LOCALIZAÇÃO"
    print_test "POST /sessions/$SESSION_ID/messages (location)"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    # Gerar messageId único
    msg_id="msg-$(date +%s)-$(shuf -i 1000-9999 -n 1)"
    
    payload=$(cat <<EOF
{
  "messageId": "$msg_id",
  "to": "$TEST_PHONE",
  "type": "location",
  "location": {
    "latitude": -23.5505,
    "longitude": -46.6333,
    "name": "São Paulo",
    "address": "São Paulo, SP, Brasil"
  }
}
EOF
)
    
    print_info "Payload:"
    echo "$payload" | jq '.'
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/sessions/$SESSION_ID/messages" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        print_success "Localização enviada com sucesso (HTTP $http_code)"
    else
        print_error "Falha ao enviar localização (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

test_delete_session() {
    print_header "10. DELETAR SESSÃO"
    
    if [ -z "$SESSION_ID" ]; then
        print_error "SESSION_ID não está definido"
        return 1
    fi
    
    print_info "Deseja deletar a sessão $SESSION_ID? (s/N)"
    read -r delete_confirm
    
    if [[ "$delete_confirm" =~ ^[Ss]$ ]]; then
        print_test "DELETE /sessions/$SESSION_ID"
        
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/sessions/$SESSION_ID")
        http_code=$(echo "$response" | tail -1)
        body=$(echo "$response" | head -n-1)
        
        if [ "$http_code" -eq 200 ]; then
            print_success "Sessão deletada com sucesso (HTTP $http_code)"
            rm -f /tmp/zaphub_session_id.txt
        else
            print_error "Falha ao deletar sessão (HTTP $http_code)"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        fi
    else
        print_info "Sessão mantida. ID salvo em /tmp/zaphub_session_id.txt"
    fi
}

################################################################################
# Função Principal
################################################################################

main() {
    clear
    
    print_header "🚀 ZAPHUB API - TESTE COMPLETO"
    echo -e "${CYAN}API URL:${NC} $API_URL"
    echo -e "${CYAN}Webhook:${NC} $WEBHOOK_URL"
    echo -e "${CYAN}Test Phone:${NC} $TEST_PHONE"
    echo ""
    
    # Verificar dependências
    check_dependencies
    
    # Tentar recuperar session_id anterior
    if [ -f /tmp/zaphub_session_id.txt ]; then
        SESSION_ID=$(cat /tmp/zaphub_session_id.txt)
        print_info "Session ID anterior encontrado: $SESSION_ID"
        print_info "Usar esta sessão? (s/N)"
        read -r use_existing
        
        if [[ ! "$use_existing" =~ ^[Ss]$ ]]; then
            SESSION_ID=""
        fi
    fi
    
    # Executar testes
    test_health_check
    
    if [ -z "$SESSION_ID" ]; then
        test_create_session
    fi
    
    test_list_sessions
    test_get_qr_code
    
    # Aguardar conexão (polling automático)
    test_check_status
    connection_result=$?
    
    # Testes de mensagem (só se conectou)
    if [ $connection_result -eq 0 ]; then
        print_info "Executar testes de envio de mensagens? (s/N)"
        read -r send_messages
    else
        print_info "Pular testes de mensagem (não conectado). Continuar? (s/N)"
        read -r send_messages
        send_messages="n"
    fi
    
    if [[ "$send_messages" =~ ^[Ss]$ ]]; then
        test_send_text_message
        
        print_info "Enviar também imagem, documento e localização? (s/N)"
        read -r send_media
        
        if [[ "$send_media" =~ ^[Ss]$ ]]; then
            test_send_image
            test_send_document
            test_send_location
        fi
    fi
    
    # Deletar sessão
    test_delete_session
    
    # Relatório final
    print_header "📊 RELATÓRIO FINAL"
    echo -e "${CYAN}Total de testes:${NC} $TEST_COUNT"
    echo -e "${GREEN}Sucessos:${NC} $PASS_COUNT"
    echo -e "${RED}Falhas:${NC} $FAIL_COUNT"
    
    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "\n${GREEN}🎉 TODOS OS TESTES PASSARAM!${NC}\n"
    else
        echo -e "\n${YELLOW}⚠️  Alguns testes falharam. Verifique os logs acima.${NC}\n"
    fi
    
    print_info "Session ID: $SESSION_ID"
    print_info "QR Code HTML: file:///tmp/zaphub_qr.html"
}

################################################################################
# Executar
################################################################################

main
