import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const keyFromBase64 = (encoded: string) => {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('凭证加密密钥必须是 32 字节 Base64');
  return key;
};

export const encryptCredentials = (value: Record<string, string>, encodedKey: string): Buffer => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromBase64(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
};

export const decryptCredentials = (payload: Buffer, encodedKey: string): Record<string, string> => {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', keyFromBase64(encodedKey), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8'),
  ) as Record<string, string>;
};

export const rotateCredentials = (payload: Buffer, oldKey: string, newKey: string): Buffer =>
  encryptCredentials(decryptCredentials(payload, oldKey), newKey);

export const credentialStatus = (credentials?: Record<string, string>) => ({
  configured: Boolean(credentials && Object.values(credentials).some(Boolean)),
  fields: Object.keys(credentials ?? {}),
});
