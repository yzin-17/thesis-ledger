import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/platform/config.js';

const base = { DATABASE_URL: 'postgresql://fixture:fixture@localhost/test', REDIS_URL: 'redis://localhost:6379',
  DSA_BASE_URL: 'http://localhost:8000', THESIS_LEDGER_DSA_TOKEN: 'fixture', CREDENTIAL_ENCRYPTION_KEY: 'fixture-key-123456' };
describe('历史重建只读清单配置', () => {
  it('缺两项配置允许启动，但不提供重建依据', () => {
    expect(parseConfig(base)).not.toHaveProperty('marketPitReconstructionFile');
  });
  it('精确绝对路径及摘要成对接受', () => {
    expect(parseConfig({ ...base, MARKET_PIT_RECONSTRUCTION_FILE: '/tmp/pit.json', MARKET_PIT_RECONSTRUCTION_SHA256: 'a'.repeat(64) }))
      .toMatchObject({ marketPitReconstructionFile: '/tmp/pit.json', marketPitReconstructionSha256: 'a'.repeat(64) });
  });
  it.each(['path-only', 'hash-only', 'relative', 'invalid-hash'] as const)('拒绝 %s 配置', kind => {
    const environment: Record<string, string> = { ...base, MARKET_PIT_RECONSTRUCTION_FILE: '/tmp/pit.json', MARKET_PIT_RECONSTRUCTION_SHA256: 'a'.repeat(64) };
    if (kind === 'path-only') delete environment.MARKET_PIT_RECONSTRUCTION_SHA256;
    else if (kind === 'hash-only') delete environment.MARKET_PIT_RECONSTRUCTION_FILE;
    else if (kind === 'relative') environment.MARKET_PIT_RECONSTRUCTION_FILE = 'pit.json';
    else environment.MARKET_PIT_RECONSTRUCTION_SHA256 = 'invalid';
    expect(() => parseConfig(environment)).toThrow('MARKET_PIT_RECONSTRUCTION');
  });
});
