import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { desiredProviderPolicyV3Schema, effectiveProviderPolicyV3Schema, marketRouteCatalogV3Schema } from '@thesis-ledger/schemas';
import { resolveChartOptionsV3 } from '../../src/market/market-chart-options-v3.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
const setup = () => ({
  desired: desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json')),
  effective: effectiveProviderPolicyV3Schema.parse(fixture('market-control-v3.effective.etf-qfq.json')),
  catalog: marketRouteCatalogV3Schema.parse(fixture('market-route-catalog-v3.complete.json')),
});
const identity = { symbol: '159516.SZ', assetType: 'ETF' as const };

describe('图表逐口径可用性', () => {
  it('只允许精确配置且有效的口径', () => {
    const { desired, effective, catalog } = setup();
    const result = resolveChartOptionsV3(identity, desired, effective, catalog);
    expect(result.options).toEqual([
      { adjustment: 'none', available: false, reason: 'route_not_configured' },
      { adjustment: 'qfq', available: true, reason: null },
      { adjustment: 'hfq', available: false, reason: 'route_not_configured' },
    ]);
  });
  it('凭据缺失保留具体原因，不被其他口径或备用来源的 ready 覆盖', () => {
    const { desired, effective, catalog } = setup();
    effective.routes[0]!.targets[0]!.eligible = false;
    effective.routes[0]!.targets[0]!.reason = 'credential_missing';
    const result = resolveChartOptionsV3(identity, desired, effective, catalog);
    expect(result.options[1]).toMatchObject({ available: false, reason: 'credential_missing' });
  });
  it('目录缺失或 partial 不暴露可选项', () => {
    const { desired, effective, catalog } = setup();
    for (const value of [null, { ...catalog, integrity: 'partial' }]) {
      expect(resolveChartOptionsV3(identity, desired, effective, value).options.every((option) => !option.available)).toBe(true);
    }
  });
  it('禁用路由和修订错配不能冒充可用', () => {
    const { desired, effective, catalog } = setup();
    expect(resolveChartOptionsV3(identity, { ...desired, enabled: false }, effective, catalog).options.every((option) => option.reason === 'disabled')).toBe(true);
    expect(resolveChartOptionsV3(identity, desired, { ...effective, sourceDesiredRevision: 9 }, catalog).options.every((option) => !option.available)).toBe(true);
  });
});
