import { describe, expect, it, vi } from 'vitest';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import { RiskContextService } from '../../src/risk/risk-context.service.js';
import { riskInputUnavailableReason } from '../../src/risk/risk-input-availability.js';

const at = '2026-10-18T08:00:00.000Z';
const accountA = '10000000-0000-4000-8000-000000000001';
const accountB = '10000000-0000-4000-8000-000000000002';
const position = (index: number, currency = 'CNY', accountId = accountA) => ({
  id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  symbol: `TEST${index}.US`,
  accountId,
  quantity: '1',
  costPrice: '100',
  updatedAt: new Date(at),
  asset: { assetType: 'stock', currency },
});
type Context = {
  symbol: string;
  price?: number;
  weight?: number;
  accountWeight?: number;
  dataQuality: Record<string, string>;
};

const fixture = (
  positions: ReturnType<typeof position>[],
  missingPrice?: string,
  fxAvailable = true,
) => {
  const riskScan = vi.fn<(contexts: Context[]) => Promise<{ results: never[] }>>(async () => ({
    results: [],
  }));
  const findMany = vi.fn(async (args: { where: { account: { mode: string } } }) =>
    args.where.account.mode === 'actual' ? positions : [],
  );
  const market = {
    getQuote: vi.fn(async (symbol: string) => {
      if (symbol === missingPrice) throw new Error('受控缺价');
      const item = positions.find((row) => row.symbol === symbol)!;
      return {
        symbol,
        price: item.asset.currency === 'USD' ? 100 : 700,
        marketTime: at,
        fetchedAt: at,
        provider: 'controlled',
        stale: false,
        freshness: 'live',
        units: { priceCurrency: item.asset.currency },
      };
    }),
    getFundNav: vi.fn(),
    getFxRates: vi.fn(async () => ({
      version: 3,
      baseCurrency: 'CNY',
      asOf: at.slice(0, 10),
      fetchedAt: at,
      maxAgeDays: 3,
      rates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: fxAvailable ? 7 : undefined,
          rateDate: at.slice(0, 10),
          provider: 'controlled',
          fetchedAt: at,
          freshness: fxAvailable ? 'live' : 'unavailable',
          stale: false,
          ageDays: 0,
          available: fxAvailable,
        },
      ],
    })),
  };
  const runtime = new AutomationRuntimeHandlers(
    { position: { findMany } } as never,
    { riskScan } as never,
    market as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const run = async () => {
    const callIndex = riskScan.mock.calls.length;
    const result = await runtime
      .for('risk-evaluation')
      .run(new AbortController().signal, new Date(at));
    return { result, contexts: riskScan.mock.calls[callIndex]![0] };
  };
  return { market, findMany, run };
};

describe('后台风险估值的币种与覆盖', () => {
  it('100 USD 与 700 CNY 经合成汇率 7 后各占组合 50%，各自账户独立占 100%', async () => {
    const h = fixture([position(1, 'USD'), position(2, 'CNY', accountB)]);
    const { contexts } = await h.run();
    expect(contexts.map((row) => row.weight)).toEqual([0.5, 0.5]);
    expect(contexts.map((row) => row.accountWeight)).toEqual([1, 1]);
    expect(h.market.getFxRates).toHaveBeenCalledWith(
      expect.objectContaining({ baseCurrency: 'CNY' }),
    );
    expect(h.findMany.mock.calls.map(([args]) => args.where.account.mode)).toEqual([
      'actual',
      'shadow',
    ]);
  });

  it('缺价不删除持仓或把余仓归一为100%，另一个完整账户仍可评估', async () => {
    const rows = [position(1), position(2, 'CNY', accountB)];
    const { contexts, result } = await fixture(rows, rows[1]!.symbol).run();
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).not.toHaveProperty('weight');
    expect(contexts[0]!.accountWeight).toBe(1);
    expect(contexts[0]!.dataQuality).toMatchObject({
      marketData: 'fresh',
      portfolioWeight: 'unavailable',
      accountWeight: 'complete',
    });
    expect(contexts[1]).not.toHaveProperty('price');
    expect(result).toMatchObject({ missingSymbols: [rows[1]!.symbol] });
  });

  it('必要 FX 缺失时组合不输出权重，单币账户不需要该 FX', async () => {
    const { contexts } = await fixture(
      [position(1, 'USD'), position(2, 'CNY', accountB)],
      undefined,
      false,
    ).run();
    expect(contexts.every((row) => row.weight === undefined)).toBe(true);
    expect(contexts.map((row) => row.accountWeight)).toEqual([1, 1]);
    expect(contexts.every((row) => row.price !== undefined)).toBe(true);
  });

  it.each(['stale', 'future', 'unknown'] as const)('拒绝 %s 行情但保留持仓身份', async (kind) => {
    const h = fixture([position(1)]);
    const quote = await h.market.getQuote('TEST1.US');
    if (kind === 'stale') quote.stale = true;
    if (kind === 'future') quote.marketTime = '2026-10-19T08:00:00.000Z';
    if (kind === 'unknown') quote.freshness = 'unknown';
    h.market.getQuote.mockResolvedValue(quote);
    const { contexts } = await h.run();
    expect(contexts[0]).not.toHaveProperty('price');
    expect(contexts[0]).not.toHaveProperty('weight');
    expect(contexts[0]!.dataQuality.marketData).toBe('unavailable');
  });

  it.each(['missing', 'stale', 'future', 'unknown-age'] as const)(
    '拒绝 %s 汇率，单币账户仍完整',
    async (kind) => {
      const h = fixture([position(1, 'USD'), position(2, 'CNY', accountB)]);
      const fx = await h.market.getFxRates();
      if (kind === 'missing') fx.rates = [];
      if (kind === 'stale') fx.rates[0]!.stale = true;
      if (kind === 'future') fx.rates[0]!.rateDate = '2026-10-19';
      if (kind === 'unknown-age') fx.rates[0]!.ageDays = null as never;
      h.market.getFxRates.mockResolvedValue(fx);
      const { contexts } = await h.run();
      expect(contexts.map((row) => row.weight)).toEqual([undefined, undefined]);
      expect(contexts.map((row) => row.accountWeight)).toEqual([1, 1]);
    },
  );

  it('同币种按高精度数量汇总；零分母不伪造零比例', async () => {
    const rows = [position(1), position(2)];
    rows[0]!.quantity = '0.000000000000000000000001';
    rows[1]!.quantity = '0.000000000000000000000003';
    const { contexts } = await fixture(rows).run();
    expect(contexts.map((row) => row.weight)).toEqual([0.25, 0.75]);
    rows.forEach((row) => {
      row.quantity = '0';
    });
    const zero = await fixture(rows).run();
    expect(zero.contexts.every((row) => row.weight === undefined)).toBe(true);
    expect(zero.result).toMatchObject({ valuation: { portfolioComplete: false } });
  });

  it('仅正式 NAV 可估值，不接受陈旧或不可用净值', async () => {
    const fund = position(1);
    fund.symbol = '000001.OF';
    fund.asset.assetType = 'fund';
    const h = fixture([fund]);
    h.market.getFundNav.mockResolvedValue({
      symbol: fund.symbol,
      unitNav: 1.23,
      navDate: '2026-10-17T00:00:00.000Z',
      provider: 'controlled-nav',
      freshness: 'delayed',
    });
    expect((await h.run()).contexts[0]!.weight).toBe(1);
    expect(h.market.getQuote).not.toHaveBeenCalled();
    fund.asset.currency = 'USD';
    expect((await h.run()).contexts[0]).not.toHaveProperty('weight');
    fund.asset.currency = 'CNY';
    for (const freshness of ['stale', 'unavailable']) {
      h.market.getFundNav.mockResolvedValue({
        symbol: fund.symbol,
        unitNav: 1.23,
        navDate: '2026-10-17T00:00:00.000Z',
        provider: 'controlled-nav',
        freshness,
      });
      expect((await h.run()).contexts[0]).not.toHaveProperty('weight');
    }
  });

  it('派生账户使用账户比例，组合权重缺失不拒绝完整账户；缺失不被合并为0', async () => {
    const { contexts } = await fixture(
      [position(1, 'USD'), position(2, 'CNY', accountB)],
      undefined,
      false,
    ).run();
    const service = new RiskContextService({} as never);
    const parsed = await service.prepare(contexts, false);
    expect(parsed.accounts.map((row) => row.positions?.[0]?.weight)).toEqual([1, 1]);
    expect(parsed.portfolio?.positions).toBeUndefined();
    const rule = {
      id: 'test',
      version: 1,
      scope: 'security' as const,
      kind: 'position-concentration' as const,
      threshold: 0.4,
      severity: 'warning' as const,
      enabled: true,
    };
    const global = service.candidatesForRule(rule, parsed);
    expect(global[0]!.domain.weight).toBeUndefined();
    expect(riskInputUnavailableReason(rule, global[0]!)).toContain('组合权重不可用');
    const bound = { ...rule, accountId: accountA };
    const local = service.candidatesForRule(bound, parsed);
    expect(local[0]!.domain.accountWeight).toBe(1);
    expect(riskInputUnavailableReason(bound, local[0]!)).toBeUndefined();
  });

  it('同标的跨账户组合权重相加，完整性合并不被后来的 fresh 覆盖', async () => {
    const rows = [position(1), position(2, 'CNY', accountB)];
    rows[1]!.symbol = rows[0]!.symbol;
    const { contexts } = await fixture(rows).run();
    const parsed = await new RiskContextService({} as never).prepare(contexts, false);
    expect(parsed.portfolio?.positions).toEqual([{ symbol: rows[0]!.symbol, weight: 1 }]);
    contexts[0]!.dataQuality.portfolioWeight = 'unavailable';
    const partial = await new RiskContextService({} as never).prepare(contexts, false);
    expect(partial.portfolio!.dataQuality.portfolioWeight).toBe('unavailable');
  });
});
