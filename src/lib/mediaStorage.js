import fs from 'fs/promises';
import path from 'path';
import config from '../../config/index.js';
import logger from './logger.js';
import getS3Client from './s3Client.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

function ensureLeadingSlash(value) {
  if (!value) {
    return '';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function determineExtension(type, mimeType, originalName) {
  if (originalName && originalName.includes('.')) {
    return originalName.split('.').pop().toLowerCase();
  }

  if (mimeType && MIME_EXTENSION_MAP[mimeType]) {
    return MIME_EXTENSION_MAP[mimeType];
  }

  switch (type) {
    case 'image':
      return 'jpg';
    case 'video':
      return 'mp4';
    case 'audio':
      return 'ogg';
    case 'document':
      return 'bin';
    case 'sticker':
      return 'webp';
    default:
      return 'bin';
  }
}

function buildLocalMediaUrl(relativePath) {
  const localConfig = config.media?.local || {};
  const configuredBaseUrl = localConfig.baseUrl;
  const serverUrl = config.server?.publicUrl || null;
  const baseUrl = configuredBaseUrl || serverUrl;

  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}/${relativePath}`;
  }

  return `/media${ensureLeadingSlash(relativePath)}`;
}

function buildS3Url(key, s3Config) {
  if (s3Config.baseUrl) {
    return `${s3Config.baseUrl.replace(/\/$/, '')}/${key}`;
  }

  if (s3Config.endpoint) {
    return `${s3Config.endpoint.replace(/\/$/, '')}/${s3Config.bucket}/${key}`;
  }

  return `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
}

export async function saveMediaBuffer(sessionId, type, buffer, options = {}) {
  if (!buffer?.length) {
    throw new Error('Cannot save empty media buffer');
  }

  const storageConfig = config.media;
  const extension = determineExtension(type, options.mimeType, options.fileName);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const relativePath = path.join(sessionId, fileName).replace(/\\/g, '/');

  if (storageConfig.storage === 's3') {
    const s3Config = storageConfig.s3;
    if (!s3Config?.bucket) {
      throw new Error('MEDIA_S3_BUCKET is required when MEDIA_STORAGE=s3');
    }

    const client = getS3Client();
    const key = relativePath;

    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: buffer,
        ContentType: options.mimeType,
        ACL: s3Config.acl,
      })
    );

    const url = buildS3Url(key, s3Config);
    logger.debug(
      { sessionId, type, key, size: buffer.length },
      '[MediaStorage] Uploaded media to S3'
    );

    return {
      absolutePath: null,
      relativePath: key,
      fileName,
      extension,
      url,
      size: buffer.length,
    };
  }

  if (storageConfig.storage !== 'local') {
    throw new Error(`Media storage provider ${storageConfig.storage} is not supported`);
  }

  const basePath = storageConfig.local.basePath;
  const sessionDir = path.join(basePath, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const absolutePath = path.join(sessionDir, fileName);
  await fs.writeFile(absolutePath, buffer);

  const url = buildLocalMediaUrl(relativePath);

  logger.debug(
    { sessionId, type, fileName, size: buffer.length },
    '[MediaStorage] Saved media file locally'
  );

  return {
    absolutePath,
    relativePath,
    fileName,
    extension,
    url,
    size: buffer.length,
  };
}

export default {
  saveMediaBuffer,
};
