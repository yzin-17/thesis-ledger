import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from '../../src/platform/links/external-url';
describe('手机外部链接', () => {
  it('拒绝脚本、明文和夹带凭证的链接，并对授权域名精确匹配', () => {
    for (const value of ['javascript:alert(1)', 'http://a.test', 'https://user:secret@a.test'])
      expect(() => safeExternalUrl(value)).toThrow();
    expect(safeExternalUrl('https://a.test/path', ['a.test'])).toBe('https://a.test/path');
    expect(() => safeExternalUrl('https://a.test.evil/path', ['a.test'])).toThrow();
  });
});
