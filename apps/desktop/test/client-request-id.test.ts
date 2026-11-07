import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientRequestId } from '../src/lib/client-request-id';

afterEach(() => vi.unstubAllGlobals());
describe('浏览器请求 UUID', () => {
  it('使用原生 UUID 并保留 Crypto 接收者', () => {
    const crypto = { randomUUID() { expect(this).toBe(crypto); return 'native-uuid'; } };
    vi.stubGlobal('crypto', crypto);
    expect(createClientRequestId()).toBe('native-uuid');
  });
  it('缺少 randomUUID 时以安全随机数生成独立的 UUID v4', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 1000 }, createClientRequestId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('缺少安全随机能力时明确失败，禁止弱随机降级', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createClientRequestId).toThrow('无法安全生成请求标识');
    vi.stubGlobal('crypto', {});
    expect(createClientRequestId).toThrow('无法安全生成请求标识');
  });
});
