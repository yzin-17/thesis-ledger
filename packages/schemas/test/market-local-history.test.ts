import { describe, expect, it } from 'vitest';
import { providerManifestSchema } from '../src/market.js';

const fixture = () => ({
  providerId: 'official-dividends',
  displayName: '管理人现金分红公告（本地）',
  version: 1,
  capabilities: { CASH_DISTRIBUTION: ['ETF'] },
  configured: true,
  enabled: true,
  credentialConfigured: true,
  sourceKind: 'local_history',
  upstreamSources: [
    {
      sourceId: 'cn-etf-cash-notices',
      displayName: '沪深300ETF现金分红公告',
      capabilities: { CASH_DISTRIBUTION: ['ETF'] },
      localHistory: {
        datasetId: 'cn-510300-cash',
        symbols: ['510300.SH'],
        coverage: { start: '2023-01-03', end: '2023-02-01' },
        updateMode: 'bundled',
      },
    },
  ],
});

describe('本地资料清单契约', () => {
  it('保留覆盖元信息，兼容原有清单', () => {
    expect(
      providerManifestSchema.parse(fixture()).upstreamSources?.[0]?.localHistory?.coverage.end,
    ).toBe('2023-02-01');
    const legacy: Record<string, unknown> = fixture();
    delete legacy.sourceKind;
    delete legacy.upstreamSources;
    expect(providerManifestSchema.safeParse(legacy).success).toBe(true);
  });
  it('拒绝倒置日期和无标的／交易范围的资料', () => {
    const wrongRange = fixture();
    wrongRange.upstreamSources[0]!.localHistory.coverage.end = '2023-01-01';
    expect(providerManifestSchema.safeParse(wrongRange).success).toBe(false);
    const noScope = fixture();
    noScope.upstreamSources[0]!.localHistory.symbols = [];
    expect(providerManifestSchema.safeParse(noScope).success).toBe(false);
  });
});
