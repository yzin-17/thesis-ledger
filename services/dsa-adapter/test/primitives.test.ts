import { describe, expect, it } from 'vitest';
import {
  credentialStatus,
  decryptCredentials,
  encryptCredentials,
  rotateCredentials,
  defaultCnTradingDay,
  missingRanges,
} from '../src/index.js';

describe('凭证存储', () => {
  const firstKey = Buffer.alloc(32, 1).toString('base64');
  const secondKey = Buffer.alloc(32, 2).toString('base64');
  it('加密保存、读取和轮换且不返回明文状态', () => {
    const encrypted = encryptCredentials({ token: 'secret' }, firstKey);
    expect(encrypted.toString()).not.toContain('secret');
    expect(decryptCredentials(encrypted, firstKey)).toEqual({ token: 'secret' });
    expect(
      decryptCredentials(rotateCredentials(encrypted, firstKey, secondKey), secondKey),
    ).toEqual({ token: 'secret' });
    expect(credentialStatus({ token: 'secret' })).toEqual({ configured: true, fields: ['token'] });
  });
});

describe('交易日历计算原语', () => {
  it('区分周末与交易日时段', () => {
    expect(defaultCnTradingDay('2025-01-04')).toMatchObject({ open: false, sessions: [] });
    expect(defaultCnTradingDay('2025-01-03')).toMatchObject({ open: true });
  });
  it('回填范围只报告缺失交易日并排除交易所节假日', () => {
    expect(missingRanges(['2025-01-02'], '2025-01-01', '2025-01-05')).toEqual(['2025-01-03']);
  });
});
