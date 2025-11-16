const { Boom } = require('@hapi/boom');
const {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const Pino = require('pino');
const qrcode = require('qrcode-terminal');

if (typeof global.crypto === 'undefined') {
  global.crypto = webcrypto;
}

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'auth_data');
const DEFAULT_WEBHOOK_URL = process.env.BAILEYS_WEBHOOK_URL || null;
const DEFAULT_WEBHOOK_TIMEOUT_MS = parseInt(
  process.env.BAILEYS_WEBHOOK_TIMEOUT_MS,
  10,
) || 10000;

async function sendWebhookNotification(webhookUrl, payload, timeoutMs) {
  if (!webhookUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZapHub-BaileysWebhook/1.0',
        'X-ZapHub-Event': 'message.received',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        '[Baileys] Webhook returned non-OK status:',
        response.status,
        response.statusText,
      );
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Baileys] Webhook request timed out');
    } else {
      console.error('[Baileys] Failed to send webhook notification:', err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function startWhatsApp(options = {}) {
  const {
    dataDir = DEFAULT_DATA_DIR,
    loggerLevel = 'info',
    webhookUrl = DEFAULT_WEBHOOK_URL,
    webhookTimeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS,
    handleIncomingMessage = defaultMessageHandler,
  } = options;

  const { state, saveCreds } = await useMultiFileAuthState(dataDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  if (!isLatest) {
    console.warn(
      `[Baileys] Versão recomendada: ${version.join(
        '.',
      )}. Atualize @whiskeysockets/baileys para evitar problemas.`,
    );
  }

  const socket = makeWASocket({
    version,
    auth: state,
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    logger: Pino({ level: loggerLevel }),
  });

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[Baileys] Escaneie o QR code abaixo para autenticar:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : lastDisconnect?.error?.output?.statusCode;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.warn('[Baileys] Conexão perdida, tentando reconectar...');
        try {
          await startWhatsApp(options);
        } catch (err) {
          console.error('[Baileys] Falha ao reconectar:', err);
        }
      } else {
        console.log(
          '[Baileys] Sessão encerrada. Remova a pasta auth_data para iniciar uma nova sessão.',
        );
      }
    }

    if (connection === 'open') {
      console.log('[Baileys] Conexão estabelecida com sucesso!');
    }
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') {
      return;
    }

    const [message] = m.messages;
    if (!message?.message || message.key.fromMe) {
      return;
    }

    try {
      await handleIncomingMessage({
        socket,
        message,
        webhookUrl,
        webhookTimeoutMs,
      });
    } catch (err) {
      console.error('[Baileys] Erro ao tratar mensagem recebida:', err);
    }
  });
  return socket;
}

async function defaultMessageHandler({
  socket,
  message,
  webhookUrl = DEFAULT_WEBHOOK_URL,
  webhookTimeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS,
}) {
  const remoteJid = message.key.remoteJid;
  const pushName = message.pushName || 'Contato';
  const text =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    '';
  const messageType = message.message
    ? Object.keys(message.message)[0]
    : 'unknown';
  const rawTimestamp = message.messageTimestamp;
  const timestamp = (() => {
    if (typeof rawTimestamp === 'number') {
      return rawTimestamp;
    }
    if (typeof rawTimestamp === 'bigint') {
      return Number(rawTimestamp);
    }
    if (typeof rawTimestamp === 'object' && rawTimestamp !== null) {
      const low = Number(rawTimestamp.low || 0);
      const high = Number(rawTimestamp.high || 0);
      return low + high * 0x100000000;
    }
    return Date.now();
  })();

  await sendWebhookNotification(
    webhookUrl,
    {
      event: 'message.received',
      timestamp: new Date().toISOString(),
      data: {
        remoteJid,
        pushName,
        messageId: message.key?.id,
        messageType,
        text,
        timestamp,
        rawMessage: message.message,
      },
    },
    webhookTimeoutMs,
  );

  console.log(`[Baileys] Mensagem recebida de ${pushName}: ${text}`);

  if (text.trim().toLowerCase() === 'ping') {
    await socket.sendMessage(remoteJid, { text: 'pong' });
  }
}

module.exports = {
  startWhatsApp,
};

if (require.main === module) {
  startWhatsApp().catch((err) => {
    console.error('[Baileys] Falha ao iniciar o cliente:', err);
    process.exitCode = 1;
  });
}
