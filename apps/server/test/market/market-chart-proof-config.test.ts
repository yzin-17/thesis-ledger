import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/platform/config.js';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  DSA_BASE_URL: 'http://localhost:8000',
  THESIS_LEDGER_DSA_TOKEN: 'test-token',
  CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key',
};
describe('图表证明部署配置', () => {
  it('默认不配置证明供给', () => {
    expect(parseConfig(base).marketChartCompatibilityFile).toBeUndefined();
  });
  it('只接受成对配置的绝对路径与完整摘要', () => {
    const env = {
      ...base,
      MARKET_CHART_COMPATIBILITY_FILE: '/proofs/chart.json',
      MARKET_CHART_COMPATIBILITY_SHA256: 'a'.repeat(64),
    };
    expect(parseConfig(env).marketChartCompatibilitySha256).toBe('a'.repeat(64));
    expect(() =>
      parseConfig({
        ...base,
        MARKET_CHART_COMPATIBILITY_FILE: env.MARKET_CHART_COMPATIBILITY_FILE,
      }),
    ).toThrow();
    expect(() =>
      parseConfig({
        ...base,
        MARKET_CHART_COMPATIBILITY_SHA256: env.MARKET_CHART_COMPATIBILITY_SHA256,
      }),
    ).toThrow();
    expect(() =>
      parseConfig({ ...env, MARKET_CHART_COMPATIBILITY_FILE: 'relative.json' }),
    ).toThrow();
    expect(() => parseConfig({ ...env, MARKET_CHART_COMPATIBILITY_SHA256: 'wrong' })).toThrow();
  });
});
