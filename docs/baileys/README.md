# Integração com Baileys

Este projeto utiliza a biblioteca [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) para se conectar à API Web do WhatsApp.

## Pré-requisitos

- Node.js 18 ou superior.
- Dependências instaladas com `npm install`.

## Como executar

```bash
npm start
```

Ao rodar o comando acima:

1. Um QR Code será exibido no terminal.
2. Abra o WhatsApp no celular, acesse **Aparelhos conectados** e escaneie o QR Code.
3. Aguarde a confirmação no terminal.

Os dados de autenticação serão salvos em `auth_data/`. Caso precise iniciar uma nova sessão, apague esta pasta manualmente.

## Comportamento padrão

- Mensagens recebidas são logadas no terminal.
- Se receber o texto `ping`, o bot responde automaticamente `pong`.

Você pode personalizar o comportamento sobrescrevendo a função `handleIncomingMessage` em `src/connections/baileys/index.js`.

