import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { HttpException } from '@nestjs/common';

let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 4) throw new HttpException('身份验证繁忙，请稍后重试', 429);
  active += 1;
  try {
    return await new Promise((resolve, reject) => scrypt(password, salt, 64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key)));
  } finally { active -= 1; }
}
export async function hashIdentityPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1:${salt.toString('hex')}:${key.toString('hex')}`;
}
export const missingIdentityPassword = `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function verifyIdentityPassword(password: string, stored: string) {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt-v1' || !/^[a-f0-9]{32}$/u.test(parts[1]!)
    || !/^[a-f0-9]{128}$/u.test(parts[2]!)) return false;
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = await derive(password, Buffer.from(parts[1]!, 'hex'));
  return timingSafeEqual(actual, expected);
}
