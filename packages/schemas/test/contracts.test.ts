import { describe, expect, it } from 'vitest';
import {
  chipDistributionSchema,
  quoteSchema,
  fundNavHistorySchema,
  fundNavSchema,
  fxRatesResponseSchema,
  marketDetailRequestSchema,
  marketDetailSectionSchema,
  providerManifestSchema,
  catalogDeltaSchema,
  riskRuleInputSchema,
  riskRuleUpdateSchema,
  riskScanEnvelopeSchema,
  aiAnalysisSchema,
} from '../src/index.js';

const time = '2025-01-01T01:00:00Z';

describe('AI 证据契约', () => {
  it('保留 context、tool call 和可用时间字段', () =>
    expect(
      aiAnalysisSchema.parse({
        conclusion: '谨慎',
        evidence: [
          {
            claim: '价格稳定',
            citations: [
              {
                tool: 'quote',
                sourceId: 'q1',
                provider: 'fixture',
                observedAt: time,
                marketTime: time,
                availableAt: time,
                fetchedAt: time,
              },
            ],
          },
        ],
        risks: [],
        unknowns: [],
        disclaimer: '仅供研究',
        context: { scope: 'position', accountId: 'a', symbol: '600519.SH' },
        toolCalls: [
          {
            tool: 'quote',
            permission: 'market:read',
            status: 'ok',
            inputSummary: '600519.SH',
          },
        ],
      }),
    ).toMatchObject({ context: { scope: 'position' }, toolCalls: [{ status: 'ok' }] }));
});

describe('风险规则契约', () => {
  const base = {
    kind: 'price-below' as const,
    severity: 'warning' as const,
    threshold: 10,
    enabled: true,
  };
  it('强制 security 和 account scope 提供对应 target', () => {
    expect(() => riskRuleInputSchema.parse({ ...base, scope: 'security' })).toThrow('symbol');
    expect(() => riskRuleInputSchema.parse({ ...base, scope: 'account' })).toThrow('accountId');
  });
  it('成本、止盈和移动止损必须绑定账户与标的', () => {
    for (const kind of ['cost-stop', 'take-profit', 'trailing-stop'] as const) {
      expect(() =>
        riskRuleInputSchema.parse({
          ...base,
          kind,
          scope: 'security',
          symbol: '600519.SH',
        }),
      ).toThrow('accountId');
      expect(
        riskRuleInputSchema.parse({
          ...base,
          kind,
          scope: 'security',
          symbol: '600519.SH',
          accountId: '00000000-0000-4000-8000-000000000001',
        }),
      ).toMatchObject({ kind, symbol: '600519.SH' });
    }
  });
  it('拒绝 portfolio scope 携带局部 target', () =>
    expect(() =>
      riskRuleInputSchema.parse({ ...base, scope: 'portfolio', symbol: '600519.SH' }),
    ).toThrow('portfolio'));
  it('规则部分更新不隐式改变启用状态', () => {
    expect(riskRuleUpdateSchema.parse({ threshold: 0.2 })).toEqual({ threshold: 0.2 });
  });
  it('风险扫描保留客户端批次 ID 与持仓生命周期字段', () => {
    const result = riskScanEnvelopeSchema.parse({
      scanId: '00000000-0000-4000-8000-000000000001',
      security: [
        {
          symbol: '600519.SH',
          accountId: '00000000-0000-4000-8000-000000000002',
          positionId: '00000000-0000-4000-8000-000000000003',
          quantity: 10,
          positionUpdatedAt: time,
          marketTime: time,
          dataQuality: {},
        },
      ],
    });
    expect(result.scanId).toBe('00000000-0000-4000-8000-000000000001');
    expect(result.security[0]).toMatchObject({
      positionId: '00000000-0000-4000-8000-000000000003',
      quantity: 10,
    });
  });
});

describe('行情契约', () => {
  it('接受完整报价', () =>
    expect(
      quoteSchema.parse({
        version: 3,
        symbol: '600519.SH',
        open: 10,
        high: 12,
        low: 9,
        price: 11,
        previousClose: 10,
        volume: 1,
        amount: 11,
        stale: false,
        provider: 'mock',
        marketTime: time,
        fetchedAt: time,
        freshness: 'live',
      }),
    ).toMatchObject({ price: 11 }));
  it('保留 Provider 与实际上游来源', () => {
    const quote = quoteSchema.parse({
      version: 3,
      symbol: '600519.SH',
      open: 10,
      high: 12,
      low: 9,
      price: 11,
      previousClose: 10,
      volume: 1,
      amount: 11,
      stale: false,
      provider: 'akshare',
      upstreamSource: 'tencent',
      marketTime: time,
      fetchedAt: time,
      freshness: 'live',
    });
    const provider = providerManifestSchema.parse({
      providerId: 'akshare',
      displayName: 'AKShare',
      version: 1,
      capabilities: { DAILY_BAR: ['STOCK'] },
      configured: true,
      enabled: true,
      credentialConfigured: false,
      origin: 'dsa',
      markets: ['CN'],
      configurationMode: 'control',
      upstreamSources: [
        { sourceId: 'tencent', displayName: '腾讯财经', capabilities: { DAILY_BAR: ['STOCK'] } },
      ],
    });
    expect(quote).toMatchObject({ provider: 'akshare', upstreamSource: 'tencent' });
    expect(() => quoteSchema.parse({ ...quote, version: 1 })).toThrow();
    expect(provider.upstreamSources?.[0]?.displayName).toBe('腾讯财经');
    expect(provider).toMatchObject({ markets: ['CN'] });
  });
  it('拒绝非法 OHLC', () =>
    expect(() =>
      quoteSchema.parse({
        version: 3,
        symbol: '600519.SH',
        open: 10,
        high: 8,
        low: 9,
        price: 11,
        previousClose: 10,
        volume: 1,
        amount: 11,
        stale: false,
        provider: 'mock',
        marketTime: time,
        fetchedAt: time,
        freshness: 'live',
      }),
    ).toThrow());
  it('校验筹码权重', () =>
    expect(() =>
      chipDistributionSchema.parse({
        version: 3,
        symbol: '600519.SH',
        buckets: [{ price: 10, weight: 2 }],
        averageCost: 10,
        mainPeak: 10,
        profitRatio: 0.5,
        range70: [9, 11],
        range90: [8, 12],
        concentration: 0.5,
        provider: 'mock',
        engineVersion: '1',
        calculatedAt: time,
      }),
    ).toThrow());

  it('允许只返回筹码摘要而不伪造完整分布', () => {
    const result = chipDistributionSchema.parse({
      version: 3,
      symbol: '600519.SH',
      averageCost: 10,
      profitRatio: 0.5,
      range70: [9, 11],
      range90: [8, 12],
      concentration: 0.5,
      provider: 'dsa-fork',
      engineVersion: 'dsa-thesis-ledger-v1',
      calculatedAt: time,
    });
    expect(result.symbol).toBe('600519.SH');
    expect(result).not.toHaveProperty('buckets');
    expect(result).not.toHaveProperty('mainPeak');
    expect(() => chipDistributionSchema.parse({ ...result, version: 1 })).toThrow();
  });

  it('基金净值历史要求严格升序且保留真实 Provider', () => {
    const point = (navDate: string) => ({
      version: 3,
      symbol: '000001.OF',
      unitNav: 1.2,
      navDate,
      provider: 'akshare',
      fetchedAt: time,
      freshness: 'delayed',
    });
    expect(
      fundNavHistorySchema.parse([point('2025-01-01T00:00:00Z'), point('2025-01-02T00:00:00Z')]),
    ).toHaveLength(2);
    expect(() =>
      fundNavHistorySchema.parse([point('2025-01-02T00:00:00Z'), point('2025-01-01T00:00:00Z')]),
    ).toThrow('升序');
    expect(() => fundNavSchema.parse({ ...point('2025-01-01T00:00:00Z'), version: 1 })).toThrow();
  });

  it('汇率响应拒绝旧版本', () => {
    const response = {
      version: 3,
      baseCurrency: 'CNY',
      asOf: '2025-01-01',
      fetchedAt: time,
      maxAgeDays: 7,
      rates: [],
    };
    expect(fxRatesResponseSchema.parse(response).version).toBe(3);
    expect(() => fxRatesResponseSchema.parse({ ...response, version: 1 })).toThrow();
  });

  it('非图表详情分段仍校验数据与诊断', () => {
    const quote = {
      capability: 'quote',
      status: 'ready',
      data: {
        version: 3,
        symbol: '600519.SH',
        open: 10,
        high: 12,
        low: 9,
        price: 11,
        previousClose: 10,
        volume: 100,
        amount: 1100,
        stale: false,
        provider: 'fixture',
        marketTime: time,
        fetchedAt: time,
        freshness: 'live',
      },
    };
    expect(marketDetailSectionSchema.parse(quote).status).toBe('ready');
    expect(() => marketDetailSectionSchema.parse({ ...quote, data: { price: 11 } })).toThrow();
    expect(() =>
      marketDetailSectionSchema.parse({ capability: 'chip', status: 'unavailable' }),
    ).toThrow();
  });

  it('校验行情详情请求的能力和历史条数边界', () => {
    expect(
      marketDetailRequestSchema.parse({
        symbol: '600519.SH',
        include: ['quote', 'bars'],
        barsLimit: 90,
        navLimit: 30,
        adjustment: 'hfq',
        refresh: true,
      }),
    ).toMatchObject({ symbol: '600519.SH', barsLimit: 90, adjustment: 'hfq' });
    expect(
      marketDetailRequestSchema.parse({
        symbol: '510300.OF',
        include: ['fund-nav-history'],
        navLimit: 30,
      }),
    ).not.toHaveProperty('adjustment');
    expect(() =>
      marketDetailRequestSchema.parse({ symbol: '600519.SH', adjustment: 'split' }),
    ).toThrow();
    expect(() => marketDetailRequestSchema.parse({ symbol: '600519.SH', barsLimit: 91 })).toThrow();
    expect(() =>
      marketDetailRequestSchema.parse({ symbol: '600519.SH', include: ['indicator:ATR'] }),
    ).toThrow();
  });

  it('目录增量必须携带 fromCursor 与删除身份', () => {
    expect(
      catalogDeltaSchema.parse({
        contractVersion: 3,
        generation: 2,
        checksum: 'a'.repeat(64),
        cursor: 'generation:2',
        fromCursor: 'generation:1',
        complete: true,
        items: [],
        deleted: [{ canonicalCode: '000001', instrumentType: 'STOCK', market: 'SZ' }],
      }),
    ).toMatchObject({ fromCursor: 'generation:1', deleted: [{ canonicalCode: '000001' }] });
  });
});
