const { Boom } = require('@hapi/boom');
const {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  downloadMediaMessage,
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

/**
 * Extrai informações estruturadas de uma mensagem Baileys
 */
function extractMessageContent(message) {
  const msg = message.message;
  if (!msg) {
    return { type: 'unknown', content: null, text: '' };
  }

  // Mensagem de texto simples
  if (msg.conversation) {
    return {
      type: 'text',
      content: { text: msg.conversation },
      text: msg.conversation,
    };
  }

  // Mensagem de texto estendida
  if (msg.extendedTextMessage) {
    return {
      type: 'text',
      content: { text: msg.extendedTextMessage.text },
      text: msg.extendedTextMessage.text,
    };
  }

  // Mensagem de imagem
  if (msg.imageMessage) {
    const imageMsg = msg.imageMessage;
    return {
      type: 'image',
      content: {
        mimetype: imageMsg.mimetype || 'image/jpeg',
        caption: imageMsg.caption || null,
        url: imageMsg.url || null,
        fileLength: imageMsg.fileLength || imageMsg.fileLengthLow || null,
        mediaKey: imageMsg.mediaKey ? Buffer.from(imageMsg.mediaKey).toString('base64') : null,
        fileEncSha256: imageMsg.fileEncSha256 ? Buffer.from(imageMsg.fileEncSha256).toString('base64') : null,
        fileSha256: imageMsg.fileSha256 ? Buffer.from(imageMsg.fileSha256).toString('base64') : null,
        directPath: imageMsg.directPath || null,
      },
      text: imageMsg.caption || '',
    };
  }

  // Mensagem de vídeo
  if (msg.videoMessage) {
    const videoMsg = msg.videoMessage;
    return {
      type: 'video',
      content: {
        mimetype: videoMsg.mimetype || 'video/mp4',
        caption: videoMsg.caption || null,
        url: videoMsg.url || null,
        fileLength: videoMsg.fileLength || videoMsg.fileLengthLow || null,
        mediaKey: videoMsg.mediaKey ? Buffer.from(videoMsg.mediaKey).toString('base64') : null,
        fileEncSha256: videoMsg.fileEncSha256 ? Buffer.from(videoMsg.fileEncSha256).toString('base64') : null,
        fileSha256: videoMsg.fileSha256 ? Buffer.from(videoMsg.fileSha256).toString('base64') : null,
        directPath: videoMsg.directPath || null,
        seconds: videoMsg.seconds || null,
      },
      text: videoMsg.caption || '',
    };
  }

  // Mensagem de áudio
  if (msg.audioMessage) {
    const audioMsg = msg.audioMessage;
    return {
      type: 'audio',
      content: {
        mimetype: audioMsg.mimetype || 'audio/ogg; codecs=opus',
        url: audioMsg.url || null,
        fileLength: audioMsg.fileLength || audioMsg.fileLengthLow || null,
        mediaKey: audioMsg.mediaKey ? Buffer.from(audioMsg.mediaKey).toString('base64') : null,
        fileEncSha256: audioMsg.fileEncSha256 ? Buffer.from(audioMsg.fileEncSha256).toString('base64') : null,
        fileSha256: audioMsg.fileSha256 ? Buffer.from(audioMsg.fileSha256).toString('base64') : null,
        directPath: audioMsg.directPath || null,
        seconds: audioMsg.seconds || null,
        ptt: audioMsg.ptt || false,
      },
      text: '',
    };
  }

  // Mensagem de documento
  if (msg.documentMessage) {
    const docMsg = msg.documentMessage;
    return {
      type: 'document',
      content: {
        fileName: docMsg.fileName || null,
        mimetype: docMsg.mimetype || 'application/octet-stream',
        url: docMsg.url || null,
        fileLength: docMsg.fileLength || docMsg.fileLengthLow || null,
        mediaKey: docMsg.mediaKey ? Buffer.from(docMsg.mediaKey).toString('base64') : null,
        fileEncSha256: docMsg.fileEncSha256 ? Buffer.from(docMsg.fileEncSha256).toString('base64') : null,
        fileSha256: docMsg.fileSha256 ? Buffer.from(docMsg.fileSha256).toString('base64') : null,
        directPath: docMsg.directPath || null,
        caption: docMsg.caption || null,
      },
      text: docMsg.caption || docMsg.fileName || '',
    };
  }

  // Sticker
  if (msg.stickerMessage) {
    const stickerMsg = msg.stickerMessage;
    return {
      type: 'sticker',
      content: {
        mimetype: stickerMsg.mimetype || 'image/webp',
        url: stickerMsg.url || null,
        fileLength: stickerMsg.fileLength || stickerMsg.fileLengthLow || null,
        mediaKey: stickerMsg.mediaKey ? Buffer.from(stickerMsg.mediaKey).toString('base64') : null,
        fileEncSha256: stickerMsg.fileEncSha256 ? Buffer.from(stickerMsg.fileEncSha256).toString('base64') : null,
        fileSha256: stickerMsg.fileSha256 ? Buffer.from(stickerMsg.fileSha256).toString('base64') : null,
        directPath: stickerMsg.directPath || null,
      },
      text: '',
    };
  }

  // Tipo desconhecido
  return {
    type: 'unknown',
    content: msg,
    text: '',
  };
}

/**
 * Tenta fazer download da mídia e converter para base64 (opcional)
 */
async function downloadMediaAsBase64(socket, message, messageType) {
  try {
    // Tenta primeiro com o objeto message.message (formato interno do Baileys)
    let buffer;
    try {
      const downloadTarget = message.message || message;
      buffer = await downloadMediaMessage(
        downloadTarget,
        'buffer',
        {},
        { logger: socket.logger },
      );
    } catch (firstErr) {
      // Fallback: tenta com a mensagem completa
      buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        { logger: socket.logger },
      );
    }

    if (buffer && Buffer.isBuffer(buffer)) {
      return {
        base64: buffer.toString('base64'),
        size: buffer.length,
      };
    }
  } catch (err) {
    console.warn('[Baileys] Falha ao fazer download da mídia:', err.message);
  }
  return null;
}

async function defaultMessageHandler({
  socket,
  message,
  webhookUrl = DEFAULT_WEBHOOK_URL,
  webhookTimeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS,
}) {
  const remoteJid = message.key.remoteJid;
  const pushName = message.pushName || 'Contato';
  const messageId = message.key?.id;
  
  // Extrair conteúdo estruturado da mensagem
  const { type: messageType, content, text } = extractMessageContent(message);

  // Processar timestamp
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

  // Preparar payload do webhook
  const webhookPayload = {
    event: 'message.received',
    timestamp: new Date().toISOString(),
    data: {
      remoteJid,
      pushName,
      messageId,
      messageType,
      text,
      timestamp,
      content,
      // Incluir rawMessage para referência completa
      rawMessage: message.message,
    },
  };

  // Para mensagens de mídia, tentar fazer download opcionalmente
  // (pode ser desabilitado se for muito pesado)
  const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
  if (mediaTypes.includes(messageType) && process.env.BAILEYS_DOWNLOAD_MEDIA === 'true') {
    try {
      const mediaData = await downloadMediaAsBase64(socket, message, messageType);
      if (mediaData) {
        webhookPayload.data.media = {
          base64: mediaData.base64,
          size: mediaData.size,
        };
      }
    } catch (err) {
      console.warn('[Baileys] Erro ao processar mídia para webhook:', err.message);
    }
  }

  // Enviar webhook
  await sendWebhookNotification(webhookUrl, webhookPayload, webhookTimeoutMs);

  // Log da mensagem recebida
  const logText = messageType === 'image' && content?.caption
    ? `[Imagem] ${content.caption}`
    : messageType === 'video' && content?.caption
    ? `[Vídeo] ${content.caption}`
    : messageType === 'document'
    ? `[Documento] ${content?.fileName || 'Sem nome'}`
    : text || `[${messageType}]`;

  console.log(`[Baileys] Mensagem recebida de ${pushName}: ${logText}`);

  // Resposta automática para ping
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
