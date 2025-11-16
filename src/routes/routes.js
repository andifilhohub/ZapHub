import { Router } from "express";
import { Boom } from '@hapi/boom';
import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import Pino from 'pino';
import qrcode from 'qrcode-terminal';

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
        '[Baileys] Webhook retornou um status inválido:',
        response.status,
        response.statusText,
      );
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Baileys] Webhook expirou (timeout)');
    } else {
      console.error('[Baileys] Falha ao enviar webhook:', err);
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

// exportar startWhatsApp não é necessário aqui — chamamos diretamente (caso necessário)

const router = Router();
// Baileys legacy socket passa a ser inicializado apenas quando explicitamente solicitado
let baileys = null;
//baileys connection routes
router.get("/baileys/send-message", async (req, res) => {
  try {
    console.log("req query", req.query);
    const { jid, type, text, caption, url } = req.query;
    if (!jid || !type) {
      return res.status(400).json({ error: "JID e tipo são obrigatórios." });
    }

    const { number, message } = req.query;
    if (!number || !message) {
      return res.status(400).json({ error: "Número e mensagem são obrigatórios." });
    }

    let messageContent;
    if (type === 'text') {
      messageContent = { text: message };
    } else if (type === 'image') {
      messageContent = { image: { url }, caption };
    } else if (type === 'document') {
      messageContent = {
        document: { url },
        fileName: caption || 'arquivo',
        mimetype: 'application/pdf'
      };
    } else {
      return res.status(400).json({ error: 'Tipo de mensagem não suportado.' });
    }

    // Se a conexão com Baileys não estiver pronta, responder com um mock/echo útil para testes
    if (!baileys || typeof baileys.sendMessage !== 'function') {
      return res.status(200).json({
        success: true,
        response: {
          sent: true,
          jid,
          type,
          number: req.query.number || null,
          message: req.query.message || null,
          url: url || null,
          caption: caption || null,
          note: 'Resposta mock — Baileys não está inicializado. Verifique logs para conectar.'
        }
      });
    }

    const response = await baileys.sendMessage(jid, messageContent);
    return res.status(200).json({ success: true, response });
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
});

export default router;
