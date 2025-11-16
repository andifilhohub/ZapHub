# 💎 Integração Chatwoot (Ruby) + ZapHub

Guia completo para integrar o Chatwoot (Ruby on Rails) com a API ZapHub.

---

## 📋 **Visão Geral**

```
┌─────────────────────────────────────────────────────────┐
│                   CHATWOOT (Ruby/Rails)                  │
│  - Gerencia conversas                                   │
│  - Exibe interface do usuário                           │
│  - Armazena mensagens                                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP API Calls
                     ↓
┌─────────────────────────────────────────────────────────┐
│                   ZAPHUB (Node.js)                      │
│  - Gerencia conexões WhatsApp                          │
│  - Envia/recebe mensagens                              │
│  - Gera QR Codes                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 **PASSO 1: Criar Service para ZapHub**

**Arquivo:** `app/services/whatsapp/zaphub_service.rb`

```ruby
# frozen_string_literal: true

module Whatsapp
  class ZaphubService
    include HTTParty
    
    # URL base da API ZapHub
    base_uri ENV.fetch('ZAPHUB_API_URL', 'http://localhost:3001/api/v1')
    
    # Headers padrão
    headers 'Content-Type' => 'application/json'
    
    # Timeout para requisições
    default_timeout 30
    
    def initialize(inbox = nil)
      @inbox = inbox
    end
    
    # Criar nova sessão WhatsApp
    def create_session(label:, webhook_url:)
      response = self.class.post('/sessions', {
        body: {
          label: label,
          webhook_url: webhook_url
        }.to_json
      })
      
      handle_response(response)
    end
    
    # Obter QR Code para escanear
    def get_qr_code(session_id:, format: 'data_url')
      # IMPORTANTE: Aguardar 5 segundos após criar sessão
      sleep(5) if format == 'data_url'
      
      response = self.class.get("/sessions/#{session_id}/qr", {
        query: { format: format }
      })
      
      handle_response(response)
    end
    
    # Verificar status da conexão
    def check_status(session_id:)
      response = self.class.get("/sessions/#{session_id}/status")
      handle_response(response)
    end
    
    # Aguardar conexão (polling)
    def wait_for_connection(session_id:, max_attempts: 60)
      max_attempts.times do |attempt|
        status = check_status(session_id: session_id)
        
        if status.dig('data', 'is_connected')
          Rails.logger.info "[ZapHub] Sessão #{session_id} conectada!"
          return status
        end
        
        Rails.logger.debug "[ZapHub] Aguardando conexão... Tentativa #{attempt + 1}/#{max_attempts}"
        sleep(3) # Verificar a cada 3 segundos
      end
      
      raise TimeoutError, 'Timeout aguardando conexão WhatsApp'
    end
    
    # Enviar mensagem de texto
    def send_text_message(session_id:, to:, text:)
      response = self.class.post("/sessions/#{session_id}/messages", {
        body: {
          to: to,
          type: 'text',
          text: text
        }.to_json
      })
      
      handle_response(response)
    end
    
    # Enviar mensagem com imagem
    def send_image_message(session_id:, to:, image_url:, caption: nil)
      response = self.class.post("/sessions/#{session_id}/messages", {
        body: {
          to: to,
          type: 'image',
          image: {
            url: image_url,
            caption: caption
          }
        }.to_json
      })
      
      handle_response(response)
    end
    
    # Deletar sessão
    def delete_session(session_id:)
      response = self.class.delete("/sessions/#{session_id}")
      handle_response(response)
    end
    
    private
    
    def handle_response(response)
      case response.code
      when 200..299
        JSON.parse(response.body)
      when 404
        raise NotFoundError, parse_error(response)
      when 400..499
        raise ClientError, parse_error(response)
      when 500..599
        raise ServerError, parse_error(response)
      else
        raise UnknownError, "Unexpected status code: #{response.code}"
      end
    rescue JSON::ParserError
      raise ParseError, 'Invalid JSON response from ZapHub API'
    end
    
    def parse_error(response)
      JSON.parse(response.body)['error'] || response.body
    rescue
      response.body
    end
    
    # Custom Exceptions
    class ZaphubError < StandardError; end
    class NotFoundError < ZaphubError; end
    class ClientError < ZaphubError; end
    class ServerError < ZaphubError; end
    class UnknownError < ZaphubError; end
    class ParseError < ZaphubError; end
    class TimeoutError < ZaphubError; end
  end
end
```

---

## 🎯 **PASSO 2: Adicionar ao Channel (Inbox)**

**Arquivo:** `app/models/channel/whatsapp.rb` (ou similar)

```ruby
# frozen_string_literal: true

class Channel::Whatsapp < ApplicationRecord
  include Channelable
  
  # Relacionamentos
  belongs_to :account
  has_one :inbox, as: :channel, dependent: :destroy
  
  # Atributos
  # - zaphub_session_id: string (ID da sessão no ZapHub)
  # - phone_number: string (número WhatsApp conectado)
  # - qr_code: text (QR code para exibir)
  # - connection_status: string (disconnected, qr_pending, connected)
  
  # Validações
  validates :account_id, presence: true
  validates :zaphub_session_id, uniqueness: { allow_nil: true }
  
  # Enums
  enum connection_status: {
    disconnected: 0,
    qr_pending: 1,
    connected: 2,
    failed: 3
  }
  
  # Callbacks
  after_create :initialize_zaphub_session
  before_destroy :cleanup_zaphub_session
  
  # Inicializar sessão no ZapHub
  def initialize_zaphub_session
    return if zaphub_session_id.present?
    
    Rails.logger.info "[Chatwoot] Criando sessão ZapHub para inbox #{inbox.id}"
    
    service = Whatsapp::ZaphubService.new(inbox)
    
    # Criar sessão
    response = service.create_session(
      label: "Chatwoot - #{inbox.name}",
      webhook_url: webhook_url
    )
    
    # Salvar session_id
    update!(
      zaphub_session_id: response.dig('data', 'id'),
      connection_status: :qr_pending
    )
    
    # Agendar job para obter QR code
    FetchQrCodeJob.perform_later(id)
    
  rescue Whatsapp::ZaphubService::ZaphubError => e
    Rails.logger.error "[Chatwoot] Erro ao criar sessão ZapHub: #{e.message}"
    update!(connection_status: :failed)
  end
  
  # Obter QR Code
  def fetch_qr_code
    return unless qr_pending?
    return unless zaphub_session_id.present?
    
    Rails.logger.info "[Chatwoot] Obtendo QR code para sessão #{zaphub_session_id}"
    
    service = Whatsapp::ZaphubService.new(inbox)
    
    # Obter QR code
    response = service.get_qr_code(
      session_id: zaphub_session_id,
      format: 'data_url'
    )
    
    # Salvar QR code
    update!(qr_code: response.dig('data', 'qr_code'))
    
    # Agendar job para verificar conexão
    CheckConnectionJob.set(wait: 5.seconds).perform_later(id)
    
  rescue Whatsapp::ZaphubService::NotFoundError
    Rails.logger.warn "[Chatwoot] QR code ainda não disponível"
    # Re-tentar em 3 segundos
    FetchQrCodeJob.set(wait: 3.seconds).perform_later(id)
    
  rescue Whatsapp::ZaphubService::ZaphubError => e
    Rails.logger.error "[Chatwoot] Erro ao obter QR code: #{e.message}"
    update!(connection_status: :failed)
  end
  
  # Verificar se conectou
  def check_connection
    return unless zaphub_session_id.present?
    
    service = Whatsapp::ZaphubService.new(inbox)
    status = service.check_status(session_id: zaphub_session_id)
    
    if status.dig('data', 'is_connected')
      # Conectado!
      update!(
        connection_status: :connected,
        phone_number: status.dig('data', 'phone_number'),
        qr_code: nil # Limpar QR code
      )
      
      Rails.logger.info "[Chatwoot] WhatsApp conectado: #{phone_number}"
    else
      # Ainda aguardando
      CheckConnectionJob.set(wait: 3.seconds).perform_later(id)
    end
  end
  
  # Enviar mensagem
  def send_message(contact_number:, message:)
    raise 'WhatsApp not connected' unless connected?
    
    service = Whatsapp::ZaphubService.new(inbox)
    
    # Formatar número
    formatted_number = format_phone_number(contact_number)
    
    # Enviar mensagem
    service.send_text_message(
      session_id: zaphub_session_id,
      to: formatted_number,
      text: message
    )
  end
  
  # Limpar sessão ao deletar
  def cleanup_zaphub_session
    return unless zaphub_session_id.present?
    
    Rails.logger.info "[Chatwoot] Deletando sessão ZapHub #{zaphub_session_id}"
    
    service = Whatsapp::ZaphubService.new(inbox)
    service.delete_session(session_id: zaphub_session_id)
    
  rescue => e
    Rails.logger.error "[Chatwoot] Erro ao deletar sessão: #{e.message}"
  end
  
  private
  
  def webhook_url
    # URL do webhook do Chatwoot para receber eventos
    Rails.application.routes.url_helpers.webhooks_whatsapp_url(
      account_id: account.id,
      inbox_id: inbox.id
    )
  end
  
  def format_phone_number(number)
    # Remover caracteres não numéricos
    clean = number.gsub(/\D/, '')
    
    # Adicionar @s.whatsapp.net se necessário
    clean.include?('@') ? clean : "#{clean}@s.whatsapp.net"
  end
end
```

---

## ⚙️ **PASSO 3: Criar Background Jobs**

### **Job 1: Obter QR Code**

**Arquivo:** `app/jobs/fetch_qr_code_job.rb`

```ruby
# frozen_string_literal: true

class FetchQrCodeJob < ApplicationJob
  queue_as :default
  
  def perform(channel_id)
    channel = Channel::Whatsapp.find(channel_id)
    channel.fetch_qr_code
  rescue ActiveRecord::RecordNotFound
    Rails.logger.warn "[FetchQrCodeJob] Channel #{channel_id} not found"
  rescue => e
    Rails.logger.error "[FetchQrCodeJob] Error: #{e.message}"
    # Re-tentar em 5 segundos
    FetchQrCodeJob.set(wait: 5.seconds).perform_later(channel_id)
  end
end
```

### **Job 2: Verificar Conexão**

**Arquivo:** `app/jobs/check_connection_job.rb`

```ruby
# frozen_string_literal: true

class CheckConnectionJob < ApplicationJob
  queue_as :default
  
  # Limite de tentativas (3 minutos / 3 segundos = 60 tentativas)
  MAX_ATTEMPTS = 60
  
  def perform(channel_id, attempt = 1)
    channel = Channel::Whatsapp.find(channel_id)
    
    # Verificar se já conectou
    channel.check_connection
    
    # Se ainda não conectou e não atingiu limite, tentar novamente
    if channel.qr_pending? && attempt < MAX_ATTEMPTS
      CheckConnectionJob.set(wait: 3.seconds).perform_later(channel_id, attempt + 1)
    elsif attempt >= MAX_ATTEMPTS
      Rails.logger.warn "[CheckConnectionJob] Timeout para channel #{channel_id}"
      channel.update!(connection_status: :failed)
    end
    
  rescue ActiveRecord::RecordNotFound
    Rails.logger.warn "[CheckConnectionJob] Channel #{channel_id} not found"
  rescue => e
    Rails.logger.error "[CheckConnectionJob] Error: #{e.message}"
  end
end
```

---

## 🎨 **PASSO 4: Controller para Exibir QR**

**Arquivo:** `app/controllers/api/v1/accounts/channels/whatsapp_controller.rb`

```ruby
# frozen_string_literal: true

class Api::V1::Accounts::Channels::WhatsappController < Api::V1::Accounts::BaseController
  before_action :set_channel, only: [:show, :qr_code, :status]
  
  # GET /api/v1/accounts/:account_id/channels/whatsapp/:id
  def show
    render json: {
      id: @channel.id,
      name: @channel.inbox.name,
      phone_number: @channel.phone_number,
      connection_status: @channel.connection_status,
      has_qr_code: @channel.qr_code.present?
    }
  end
  
  # GET /api/v1/accounts/:account_id/channels/whatsapp/:id/qr_code
  def qr_code
    if @channel.qr_code.present?
      render json: {
        qr_code: @channel.qr_code,
        status: @channel.connection_status
      }
    else
      render json: {
        error: 'QR code not available yet',
        status: @channel.connection_status
      }, status: :not_found
    end
  end
  
  # GET /api/v1/accounts/:account_id/channels/whatsapp/:id/status
  def status
    render json: {
      connection_status: @channel.connection_status,
      phone_number: @channel.phone_number,
      is_connected: @channel.connected?,
      has_qr_code: @channel.qr_code.present?
    }
  end
  
  private
  
  def set_channel
    @channel = Current.account.channels.find(params[:id])
  end
end
```

---

## 📺 **PASSO 5: View para Exibir QR Code**

**Arquivo:** `app/javascript/dashboard/routes/dashboard/settings/inbox/WhatsAppQRCode.vue`

```vue
<template>
  <div class="whatsapp-qr-container">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <spinner />
      <p>{{ $t('INBOX.WHATSAPP.QR_LOADING') }}</p>
    </div>
    
    <!-- QR Code -->
    <div v-else-if="qrCode" class="qr-code-display">
      <img :src="qrCode" alt="WhatsApp QR Code" class="qr-image" />
      <p class="qr-instructions">
        {{ $t('INBOX.WHATSAPP.QR_INSTRUCTIONS') }}
      </p>
      <p class="qr-timer">
        {{ $t('INBOX.WHATSAPP.QR_EXPIRES_IN', { seconds: timeRemaining }) }}
      </p>
    </div>
    
    <!-- Conectado -->
    <div v-else-if="isConnected" class="connected-state">
      <i class="ion-checkmark-circled success-icon"></i>
      <h3>{{ $t('INBOX.WHATSAPP.CONNECTED') }}</h3>
      <p>{{ $t('INBOX.WHATSAPP.PHONE_NUMBER') }}: {{ phoneNumber }}</p>
    </div>
    
    <!-- Erro -->
    <div v-else-if="error" class="error-state">
      <i class="ion-close-circled error-icon"></i>
      <p>{{ error }}</p>
      <woot-button @click="retry">
        {{ $t('INBOX.WHATSAPP.RETRY') }}
      </woot-button>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import Spinner from 'shared/components/Spinner';

export default {
  components: {
    Spinner,
  },
  
  props: {
    channelId: {
      type: Number,
      required: true,
    },
  },
  
  data() {
    return {
      loading: true,
      qrCode: null,
      isConnected: false,
      phoneNumber: null,
      error: null,
      timeRemaining: 60,
      pollingInterval: null,
      timerInterval: null,
    };
  },
  
  mounted() {
    this.fetchQRCode();
    this.startPolling();
  },
  
  beforeDestroy() {
    this.stopPolling();
    this.stopTimer();
  },
  
  methods: {
    async fetchQRCode() {
      try {
        this.loading = true;
        this.error = null;
        
        const response = await this.$http.get(
          `/api/v1/accounts/${this.accountId}/channels/whatsapp/${this.channelId}/qr_code`
        );
        
        this.qrCode = response.data.qr_code;
        this.loading = false;
        this.startTimer();
        
      } catch (error) {
        if (error.response?.status === 404) {
          // QR ainda não está pronto, tentar novamente em 3 segundos
          setTimeout(() => this.fetchQRCode(), 3000);
        } else {
          this.loading = false;
          this.error = error.response?.data?.error || 'Failed to fetch QR code';
        }
      }
    },
    
    async checkStatus() {
      try {
        const response = await this.$http.get(
          `/api/v1/accounts/${this.accountId}/channels/whatsapp/${this.channelId}/status`
        );
        
        const { is_connected, phone_number, connection_status } = response.data;
        
        if (is_connected) {
          this.isConnected = true;
          this.phoneNumber = phone_number;
          this.qrCode = null;
          this.stopPolling();
          this.stopTimer();
        } else if (connection_status === 'failed') {
          this.error = 'Connection failed';
          this.stopPolling();
        }
        
      } catch (error) {
        console.error('Error checking status:', error);
      }
    },
    
    startPolling() {
      // Verificar status a cada 3 segundos
      this.pollingInterval = setInterval(() => {
        this.checkStatus();
      }, 3000);
    },
    
    stopPolling() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    },
    
    startTimer() {
      this.timeRemaining = 60;
      this.timerInterval = setInterval(() => {
        this.timeRemaining--;
        
        if (this.timeRemaining <= 0) {
          this.stopTimer();
          this.error = 'QR Code expired';
          this.qrCode = null;
        }
      }, 1000);
    },
    
    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    },
    
    retry() {
      this.fetchQRCode();
      this.startPolling();
    },
  },
  
  computed: {
    ...mapGetters({
      accountId: 'getCurrentAccountId',
    }),
  },
};
</script>

<style scoped>
.whatsapp-qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.qr-code-display {
  text-align: center;
}

.qr-image {
  max-width: 300px;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.qr-instructions {
  margin-top: 1rem;
  color: #4a5568;
  font-size: 14px;
}

.qr-timer {
  margin-top: 0.5rem;
  color: #f56565;
  font-size: 12px;
  font-weight: 600;
}

.connected-state {
  text-align: center;
}

.success-icon {
  font-size: 48px;
  color: #48bb78;
}

.error-state {
  text-align: center;
}

.error-icon {
  font-size: 48px;
  color: #f56565;
}

.loading-state {
  text-align: center;
}
</style>
```

---

## 📝 **PASSO 6: Configurar Variáveis de Ambiente**

**Arquivo:** `.env`

```bash
# ZapHub API
ZAPHUB_API_URL=http://localhost:3001/api/v1
```

---

## 🔧 **PASSO 7: Migration para Adicionar Campos**

```bash
rails generate migration AddZaphubFieldsToChannelWhatsapp
```

**Arquivo:** `db/migrate/XXXXXX_add_zaphub_fields_to_channel_whatsapp.rb`

```ruby
class AddZaphubFieldsToChannelWhatsapp < ActiveRecord::Migration[7.0]
  def change
    add_column :channel_whatsapp, :zaphub_session_id, :string
    add_column :channel_whatsapp, :phone_number, :string
    add_column :channel_whatsapp, :qr_code, :text
    add_column :channel_whatsapp, :connection_status, :integer, default: 0
    
    add_index :channel_whatsapp, :zaphub_session_id, unique: true
  end
end
```

```bash
rails db:migrate
```

---

## 🎯 **Resumo do Fluxo**

```
1. Usuário cria Inbox WhatsApp no Chatwoot
   ↓
2. Chatwoot chama ZapHub: POST /sessions
   ↓
3. ZapHub retorna session_id
   ↓
4. Chatwoot aguarda 5 segundos
   ↓
5. Chatwoot pede QR: GET /sessions/:id/qr?format=data_url
   ↓
6. Chatwoot exibe QR na tela
   ↓
7. Usuário escaneia QR com WhatsApp
   ↓
8. Chatwoot faz polling: GET /sessions/:id/status (a cada 3s)
   ↓
9. ZapHub retorna is_connected: true
   ↓
10. Chatwoot marca como conectado!
```

---

## ✅ **Checklist de Implementação**

- [ ] Criar `Whatsapp::ZaphubService`
- [ ] Adicionar campos ao model `Channel::Whatsapp`
- [ ] Criar jobs `FetchQrCodeJob` e `CheckConnectionJob`
- [ ] Criar controller para API
- [ ] Criar componente Vue para exibir QR
- [ ] Configurar variável `ZAPHUB_API_URL`
- [ ] Rodar migrations
- [ ] Testar criação de inbox
- [ ] Testar exibição de QR
- [ ] Testar conexão

---

**Agora sim! Código Ruby para o Chatwoot integrar com ZapHub!** 💎🚀