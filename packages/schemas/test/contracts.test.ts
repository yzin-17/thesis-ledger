import { describe, expect, it } from 'vitest';
import {
  barsSchemaV1,
  chipDistributionSchemaV1,
  indicatorSchemaV1,
  quoteSchemaV1,
  fundNavHistorySchemaV1,
  marketDetailRequestSchema,
  marketDetailResponseSchema,
  catalogDeltaSchema,
  strategySchemaV1,
  ledgerEventSchemaV1,
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
      quoteSchemaV1.parse({
        version: 1,
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
  it('拒绝非法 OHLC', () =>
    expect(() =>
      quoteSchemaV1.parse({
        version: 1,
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
  it('拒绝乱序 Bar', () =>
    expect(() =>
      barsSchemaV1.parse([
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-02T00:00:00Z',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          amount: 1,
          provider: 'mock',
        },
        {
          version: 1,
          symbol: '600519.SH',
          timeframe: '1d',
          timestamp: '2025-01-01T00:00:00Z',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          amount: 1,
          provider: 'mock',
        },
      ]),
    ).toThrow('升序'));
  it.each(['MA', 'MACD', 'RSI', 'ATR'] as const)('表达 %s 指标', (name) =>
    expect(
      indicatorSchemaV1.parse({
        version: 1,
        symbol: '600519.SH',
        name,
        parameters: {},
        timeframe: '1d',
        marketTime: time,
        calculatedAt: time,
        values: { value: 1 },
        provider: 'mock',
        engineVersion: '1',
      }).name,
    ).toBe(name),
  );
  it('校验筹码权重', () =>
    expect(() =>
      chipDistributionSchemaV1.parse({
        version: 1,
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
    const result = chipDistributionSchemaV1.parse({
      version: 1,
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
  });

  it('基金净值历史要求严格升序且保留真实 Provider', () => {
    const point = (navDate: string) => ({
      version: 1,
      symbol: '000001.OF',
      unitNav: 1.2,
      navDate,
      provider: 'akshare',
      fetchedAt: time,
      freshness: 'delayed',
    });
    expect(
      fundNavHistorySchemaV1.parse([point('2025-01-01T00:00:00Z'), point('2025-01-02T00:00:00Z')]),
    ).toHaveLength(2);
    expect(() =>
      fundNavHistorySchemaV1.parse([point('2025-01-02T00:00:00Z'), point('2025-01-01T00:00:00Z')]),
    ).toThrow('升序');
  });

  it('接受共享行情详情的分段状态外壳', () => {
    const response = {
      version: 1,
      symbol: '600519.SH',
      assetType: 'STOCK',
      identity: { source: 'asset', status: 'confirmed' },
      requested: ['quote', 'chip'],
      capabilities: {
        supported: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI', 'chip'],
        unsupported: ['fund-nav'],
      },
      limits: { bars: 30, nav: 30 },
      sections: {
        quote: {
          capability: 'quote',
          status: 'ready',
          data: {
            version: 1,
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
        },
        chip: {
          capability: 'chip',
          status: 'unavailable',
          error: {
            code: 'market_data_unavailable',
            message: '当前行情暂时不可用，请稍后重试。',
            diagnosticId: 'trace:chip:1',
          },
        },
      },
      dependencies: {},
      requestId: 'trace',
      generatedAt: time,
    };
    const result = marketDetailResponseSchema.parse(response);
    expect(result.sections.chip?.status).toBe('unavailable');
    expect(() =>
      marketDetailResponseSchema.parse({
        ...response,
        sections: {
          ...response.sections,
          quote: { capability: 'quote', status: 'ready', data: { price: 11 } },
        },
      }),
    ).toThrow();
    expect(() =>
      marketDetailResponseSchema.parse({ ...response, sections: { chip: response.sections.chip } }),
    ).toThrow('requested');
  });

  it('校验行情详情请求的能力和历史条数边界', () => {
    expect(
      marketDetailRequestSchema.parse({
        symbol: '600519.SH',
        include: ['quote', 'bars'],
        barsLimit: 90,
        navLimit: 30,
        refresh: true,
      }),
    ).toMatchObject({ symbol: '600519.SH', barsLimit: 90 });
    expect(() => marketDetailRequestSchema.parse({ symbol: '600519.SH', barsLimit: 91 })).toThrow();
    expect(() =>
      marketDetailRequestSchema.parse({ symbol: '600519.SH', include: ['indicator:ATR'] }),
    ).toThrow();
  });

  it('目录增量必须携带 fromCursor 与删除身份', () => {
    expect(
      catalogDeltaSchema.parse({
        contractVersion: 1,
        generation: 2,
        checksum: 'checksum',
        cursor: 'generation:2',
        fromCursor: 'generation:1',
        complete: true,
        items: [],
        deleted: [{ canonicalCode: '000001', instrumentType: 'STOCK', market: 'SZ' }],
      }),
    ).toMatchObject({ fromCursor: 'generation:1', deleted: [{ canonicalCode: '000001' }] });
  });
});

describe('Ledger 契约', () => {
  const base = {
    version: 1,
    id: '11111111-1111-4111-8111-111111111111',
    accountId: '22222222-2222-4222-8222-222222222222',
    occurredAt: time,
    currency: 'CNY',
    source: 'fixture',
    externalUid: 'external-1',
  };
  it.each([
    ...(['BUY', 'SELL'] as const).map((type) => ({
      ...base,
      type,
      symbol: '600519.SH',
      quantity: 100,
      price: 10,
    })),
    ...(
      [
        'DIVIDEND',
        'FEE',
        'TAX',
        'INTEREST',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'CASH_DEPOSIT',
        'CASH_WITHDRAW',
      ] as const
    ).map((type) => ({ ...base, type, amount: 10 })),
    ...(['BONUS', 'SPLIT', 'MERGE'] as const).map((type) => ({
      ...base,
      type,
      symbol: '600519.SH',
      quantity: 10,
    })),
    {
      ...base,
      type: 'ADJUSTMENT' as const,
      note: '修正历史缺失记录',
    },
  ])('接受 $type 事件', (event) => expect(ledgerEventSchemaV1.parse(event).type).toBe(event.type));

  it('拒绝缺少原因的 Adjustment', () =>
    expect(() =>
      ledgerEventSchemaV1.parse({
        ...base,
        type: 'ADJUSTMENT',
      }),
    ).toThrow('受控修正'));
});

describe('策略契约', () => {
  const base = {
    version: 1 as const,
    name: 'x',
    universe: {
      symbols: ['600519.SH'],
      assetTypes: ['stock'] as const,
      filterRef: '沪深300@2025',
      asOf: time,
      validFrom: '2025-01-01',
      validTo: '2025-12-31',
    },
    entrySignals: [{ indicator: 'close', operator: 'gt' as const, value: 10 }],
    exitSignals: [{ indicator: 'close', operator: 'lt' as const, value: 9 }],
    entryCondition: {
      all: [
        { indicator: 'close', operator: 'gt' as const, value: 10 },
        { any: [{ indicator: 'volume', operator: 'gte' as const, value: 100 }] },
      ],
    },
    stopLoss: { type: 'fixed' as const, value: 0.1 },
    sizing: { type: 'weight' as const, value: 0.2 },
    execution: { price: 'close' as const, tPlusOne: true, lotSize: 100 },
    cost: { commissionRate: 0.0003, minimumCommission: 5, stampDutyRate: 0.0005, slippageRate: 0 },
    riskConstraints: [{ kind: 'cashFloor', threshold: 0.1 }],
    benchmark: '000300.SH',
  };

  it('支持可版本化 universe 与组合信号表达式', () => {
    const parsed = strategySchemaV1.parse(base);
    expect(parsed.universe.filterRef).toBe('沪深300@2025');
    expect(parsed.entryCondition).toMatchObject({ all: expect.any(Array) });
  });

  it('拒绝反向有效期', () =>
    expect(() =>
      strategySchemaV1.parse({
        ...base,
        universe: { ...base.universe, validFrom: '2026-01-01', validTo: '2025-01-01' },
      }),
    ).toThrow('有效期无效'));

  it('拒绝没有入场条件的策略', () =>
    expect(() =>
      strategySchemaV1.parse({
        version: 1,
        name: 'x',
        universe: { symbols: [], asOf: time },
        entrySignals: [],
        exitSignals: [],
        stopLoss: { type: 'fixed', value: 0.1 },
        sizing: { type: 'fixed', value: 100 },
        execution: { price: 'nextOpen', tPlusOne: true, lotSize: 100 },
        cost: { commissionRate: 0, minimumCommission: 5, stampDutyRate: 0, slippageRate: 0 },
        riskConstraints: [],
        benchmark: '000300.SH',
      }),
    ).toThrow());
});
