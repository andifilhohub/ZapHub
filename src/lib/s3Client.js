import { S3Client } from '@aws-sdk/client-s3';
import config from '../../config/index.js';

let cachedClient = null;

export function getS3Client() {
  if (cachedClient) {
    return cachedClient;
  }

  const s3Config = config.media?.s3 || {};

  const clientOptions = {
    region: s3Config.region,
  };

  if (s3Config.endpoint) {
    clientOptions.endpoint = s3Config.endpoint;
  }

  if (s3Config.accessKeyId && s3Config.secretAccessKey) {
    clientOptions.credentials = {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    };
  }

  if (s3Config.forcePathStyle) {
    clientOptions.forcePathStyle = true;
  }

  cachedClient = new S3Client(clientOptions);
  return cachedClient;
}

export default getS3Client;
