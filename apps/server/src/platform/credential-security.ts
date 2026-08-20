import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface CredentialKeyRing {
  activeVersion: string;
  keys: ReadonlyMap<string, Buffer>;
}

export type CredentialPayload = Buffer<ArrayBuffer>;

interface CredentialEnvelopeV1 {
  version: 1;
  algorithm: 'aes-256-gcm';
  keyVersion: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface DecodedCredential {
  credential: string;
  keyVersion: string | null;
  legacyPlaintext: boolean;
  needsRotation: boolean;
}

const decodeKey = (encoded: string, label: string) => {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error(`${label} 必须是 32 字节 Base64 密钥`);
  return key;
};

const copyCredentialPayload = (payload: Uint8Array): CredentialPayload => {
  const copy = Buffer.alloc(payload.byteLength);
  copy.set(payload);
  return copy;
};

export const credentialKeyRingFromEnv = (
  environment: Record<string, string | undefined> = process.env,
): CredentialKeyRing => {
  const activeEncoded = environment.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!activeEncoded) throw new Error('未配置 CREDENTIAL_ENCRYPTION_KEY');
  const activeVersion = environment.CREDENTIAL_ENCRYPTION_KEY_VERSION?.trim() || 'v1';
  const keys = new Map<string, Buffer>();
  keys.set(activeVersion, decodeKey(activeEncoded, 'CREDENTIAL_ENCRYPTION_KEY'));

  const previous = environment.CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (previous) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(previous);
    } catch {
      throw new Error('CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS 必须是 JSON object');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS 必须是 JSON object');
    for (const [version, encoded] of Object.entries(parsed)) {
      if (!version.trim() || typeof encoded !== 'string')
        throw new Error('历史凭证密钥必须使用 keyVersion -> Base64 字符串');
      if (version === activeVersion) continue;
      keys.set(version, decodeKey(encoded, `历史凭证密钥 ${version}`));
    }
  }

  return { activeVersion, keys };
};

const envelopeFromPayload = (payload: Uint8Array): CredentialEnvelopeV1 | null => {
  const text = Buffer.from(payload).toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1 || value.algorithm !== 'aes-256-gcm') return null;
  for (const field of ['keyVersion', 'iv', 'authTag', 'ciphertext'] as const)
    if (typeof value[field] !== 'string') throw new Error('Provider 凭证密文格式损坏');
  return value as unknown as CredentialEnvelopeV1;
};

export const encryptProviderCredential = (
  credential: string,
  keyRing: CredentialKeyRing = credentialKeyRingFromEnv(),
): CredentialPayload => {
  const key = keyRing.keys.get(keyRing.activeVersion);
  if (!key) throw new Error(`找不到 active credential key ${keyRing.activeVersion}`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  const envelope: CredentialEnvelopeV1 = {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyVersion: keyRing.activeVersion,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return copyCredentialPayload(Buffer.from(JSON.stringify(envelope), 'utf8'));
};

export const decryptProviderCredential = (
  payload: Uint8Array,
  keyRing: CredentialKeyRing = credentialKeyRingFromEnv(),
): DecodedCredential => {
  const envelope = envelopeFromPayload(payload);
  if (!envelope) {
    return {
      credential: Buffer.from(payload).toString('utf8'),
      keyVersion: null,
      legacyPlaintext: true,
      needsRotation: true,
    };
  }

  const key = keyRing.keys.get(envelope.keyVersion);
  if (!key) throw new Error(`找不到凭证密钥版本 ${envelope.keyVersion}`);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const credential = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return {
    credential,
    keyVersion: envelope.keyVersion,
    legacyPlaintext: false,
    needsRotation: envelope.keyVersion !== keyRing.activeVersion,
  };
};

export const normalizeProviderCredential = (
  payload: Uint8Array,
  keyRing: CredentialKeyRing = credentialKeyRingFromEnv(),
): DecodedCredential & { payload: CredentialPayload } => {
  const decoded = decryptProviderCredential(payload, keyRing);
  return {
    ...decoded,
    payload: decoded.needsRotation
      ? encryptProviderCredential(decoded.credential, keyRing)
      : copyCredentialPayload(payload),
  };
};
