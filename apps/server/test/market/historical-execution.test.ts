import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  historicalExecutionContextSchema, historicalExecutionResultSchema,
  effectiveProviderPolicyV3Schema,
} from '@thesis-ledger/schemas';
import { readHistoricalExecution } from '../../src/integration/dsa/dsa-historical-execution.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const load = () => JSON.parse(readFileSync(new URL('./fixtures/historical-execution.shared.json', import.meta.url), 'utf8'));
const fixture = () => historicalExecutionContextSchema.parse(load().context);
const input = { symbol: '588000.SH', assetType: 'ETF' as const, asOf: '2026-11-10T05:01:00.000Z' };
function policy() {
  const request = load().request;
  return effectiveProviderPolicyV3Schema.parse({ contractVersion: 1, consumer: 'thesis-ledger', requestId: 'controlled',
    revision: 1, sourceDesiredRevision: 1, enabled: true, appliedAt: '2026-11-16T00:00:00.000Z',
    routes: [{ key: request.routeKey, enabled: true, reason: null,
      targets: [{ ...request.routeTarget, eligible: true, reason: null }] }] });
}

describe('盘中执行合同与政策', () => {
  it('实际采集时间晚于历史时点时，仍按独立可见时刻核验', () => {
    expect(historicalExecutionResultSchema.parse({ ...load().request, context: fixture() }).context.asOf).toBe(input.asOf);
  });
  it.each(['future', 'expired', 'wrong-symbol', 'wrong-type', 'missing-ref', 'incomplete-fees', 'future-halt', 'inverted-prices',
    'extra-fact', 'boolean-lag', 'duplicate-fees', 'invalid-price', 'invalid-clock'])(
    '%s 拒绝而不补默认制度', (mutation) => {
      const value = load();
      if (mutation === 'future') value.context.evidence[0].availableAt = '2026-11-10T05:02:00.000Z';
      if (mutation === 'expired') value.context.fact.executionRules.range.end = '2026-11-09';
      if (mutation === 'wrong-symbol') value.context.fact.symbol = '510300.SH';
      if (mutation === 'wrong-type') value.context.fact.instrumentType = 'STOCK';
      if (mutation === 'missing-ref') value.context.trading.evidenceRefs = ['missing'];
      if (mutation === 'incomplete-fees') value.context.ruleCoverage.statutoryCharges = false;
      if (mutation === 'future-halt') value.context.trading.intradayHalts = [{ startedAt: '2026-11-10T05:02:00Z', endedAt: null }];
      if (mutation === 'inverted-prices') value.context.priceRule = { kind: 'exact', currency: 'CNY', lower: '1.000000000000000002', upper: '1.000000000000000001' };
      if (mutation === 'extra-fact') value.context.fact.extra = true;
      if (mutation === 'boolean-lag') value.context.fact.executionRules.cashSettlement.buyDebitAfterTradingDays = false;
      if (mutation === 'duplicate-fees') value.context.fact.executionRules.statutoryCharges.push(value.context.fact.executionRules.statutoryCharges[0]);
      if (mutation === 'invalid-price') value.context.priceRule.lower = 'bad';
      if (mutation === 'invalid-clock') value.context.asOf = 'bad';
      expect(historicalExecutionResultSchema.safeParse({ ...value.request, context: value.context }).success).toBe(false);
    },
  );
  it('未选择、关闭、未明确启用或没有合格目标均不出站', async () => {
    const post = vi.fn();
    const absent = policy(); absent.routes = [];
    expect(await readHistoricalExecution(input, async () => absent, post)).toBeNull();
    const disabled = policy(); disabled.routes[0]!.enabled = false;
    disabled.routes[0]!.reason = 'disabled'; disabled.routes[0]!.targets[0]!.eligible = false;
    disabled.routes[0]!.targets[0]!.reason = 'disabled';
    expect(await readHistoricalExecution(input, async () => disabled, post)).toBeNull();
    const implicit = policy(); delete implicit.routes[0]!.enabled;
    await expect(readHistoricalExecution(input, async () => implicit, post)).rejects.toThrow('明确启用');
    const missing = policy(); missing.routes[0]!.targets = []; missing.routes[0]!.reason = 'not_admitted';
    await expect(readHistoricalExecution(input, async () => missing, post)).rejects.toThrow('合格目标');
    expect(post).not.toHaveBeenCalled();
  });
  it('读取前后政策变化及不相关响应均拒绝，不自动重试', async () => {
    const changed = policy(); changed.revision = changed.sourceDesiredRevision = 2;
    const read = vi.fn().mockResolvedValueOnce(policy()).mockResolvedValueOnce(changed);
    const post = vi.fn(async (_path, body) => ({ ...body, context: fixture() }));
    await expect(readHistoricalExecution(input, read, post)).rejects.toThrow('政策已变化');
    expect(post).toHaveBeenCalledTimes(1);
    await expect(readHistoricalExecution(input, async () => policy(), async (_path, body) =>
      ({ ...(body as object), requestId: 'other', context: fixture() }))).rejects.toThrow('响应无效');
  });
  it.each(['routeIndex', 'policyRevision', 'asOf'] as const)('响应 %s 不匹配时拒绝', async (field) => {
    await expect(readHistoricalExecution(input, async () => policy(), async (_path, body) => ({
      ...body, context: fixture(),
      ...(field === 'routeIndex' ? { routeTarget: { ...body.routeTarget, routeIndex: 1 } } :
        field === 'policyRevision' ? { policyRevision: body.policyRevision + 1 } : { asOf: '2026-11-10T05:02:00.000Z' }),
    }))).rejects.toThrow('响应无效');
  });
});

function replayReader(context = fixture()) {
  const calendar = { market: 'CN' as const, timezone: 'Asia/Shanghai', revision: 'controlled',
    availableAt: '2026-01-01T00:00:00.000Z', coverageStart: '2026-10-01', coverageEnd: '2026-12-01',
    sessions: ['2026-11-10', '2026-11-11'].map(tradingDate => ({ tradingDate,
      startAt: `${tradingDate}T05:00:00.000Z`, endAt: `${tradingDate}T07:00:00.000Z` })) };
  const bars = { readRetainedResearch: vi.fn() };
  const post = vi.fn(async (_path: string, body: unknown) => ({ ...(body as object), context }));
  const dsa = { backtestInstrumentFacts: vi.fn(),
    historicalExecution: (request: typeof input) => readHistoricalExecution(request, async () => policy(), post) };
  const status = { readComposition: vi.fn() };
  const reader = new MarketArenaReplayReader({ read: vi.fn(async () => ({ status: 'ready' as const, calendar })) },
    bars, dsa, status, { read: vi.fn(async () => []) }, {
      resolve: vi.fn(async () => [{ instrumentId: '11111111-1111-4111-8111-111111111111', symbol: context.fact.symbol, assetType: 'ETF' as const, name: context.fact.symbol }]),
      prices: vi.fn(async () => ({ points: [{ timestamp: input.asOf, availableAt: input.asOf,
        open: 1.343, high: 1.343, low: 1.343, close: 1.343, volume: 100, amount: 134.3,
        completionStatus: 'complete' as const }], seriesVersion: 'controlled-minute', evidence: {
          kind: 'reconstructed-minutes' as const, archiveRef: `arena-history/${'a'.repeat(64)}.json`,
          observedAt: '2026-11-16T00:00:00.000Z', responseSha256: 'a'.repeat(64), providerId: 'controlled',
          policyRevision: 1, timestampConvention: 'interval-end' as const,
        } })),
    });
  const protocol = liveProtocolFixture({ market: 'CN', currency: 'CNY', budgetCurrency: 'CNY', timeZone: 'Asia/Shanghai' });
  return { reader, protocol, post, dsa, status };
}

describe('Market 消费完整 ETF 执行快照', () => {
  it.skipIf(!process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT)('DSA 精确收盘端点经 TS 合同，晚于会话的状态仍拒绝', () => {
    const dsaRoot = process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT!;
    const request = { ...load().request, asOf: '2026-11-10T07:00:00.000Z' };
    const receipt = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'), [
      resolve('test/market/fixtures/historical-reconstruction-offline.py'),
      resolve('test/market/fixtures/sse-halt-history.shared.json'),
    ], { cwd: dsaRoot, input: JSON.stringify(request), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1' } }));
    expect(receipt.deniedAttempts).toEqual([]);
    const result = historicalExecutionResultSchema.parse(receipt.result);
    expect(result.context.asOf).toBe(request.asOf);
    result.asOf = result.context.asOf = '2026-11-10T07:00:00.001Z';
    expect(historicalExecutionResultSchema.safeParse(result).success).toBe(false);
  });
  it('休市追平保留最后完成分钟的执行时钟，不要求收盘后的交易会话证明', async () => {
    const { reader, protocol, post } = replayReader();
    const closedAt = '2026-11-10T13:00:00.000Z';
    const result = await reader.observe(protocol, closedAt, [input.symbol]);
    expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ asOf: input.asOf }));
    expect(result.session.state).toBe('closed');
    expect(result.context.at).toBe(closedAt);
    expect(result.context.quotes[0]).toMatchObject({ marketTime: input.asOf, observedAt: closedAt });
  });
  it.skipIf(!process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT).each(['588000.SH', '510300.SH'])(
    '%s 官方空查询经实际 DSA 按日重建、TS 合同进入 Market', async symbol => {
      const value = fixture(); value.fact.symbol = symbol;
      const { reader, protocol, post, status, dsa } = replayReader(value);
      const dsaRoot = process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT!;
      post.mockImplementation(async (_path, body) => {
        const receipt = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'), [
          resolve('test/market/fixtures/historical-reconstruction-offline.py'),
          resolve('test/market/fixtures/sse-halt-history.shared.json'),
        ], { cwd: dsaRoot, input: JSON.stringify(body), encoding: 'utf8', timeout: 15000,
          env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1', THESIS_LEDGER_FIXTURE_MODE: 'false' } }));
        expect(receipt.deniedAttempts).toEqual([]);
        const context = historicalExecutionResultSchema.parse(receipt.result).context;
        expect(context.trading).toMatchObject({ state: 'trading', basis: { query: { symbol, total: 0 } } });
        expect(context.evidence.at(-1)).not.toHaveProperty('availableAt');
        return receipt.result;
      });
      const result = await reader.observe(protocol, input.asOf, [symbol]);
      expect(result.context.quotes[0]).toMatchObject({ symbol, lot: '100', tick: '0.001',
        buyBlocked: null, sellBlocked: null, positionAvailableOn: '2026-11-11' });
      expect(post).toHaveBeenCalledTimes(1);
      expect(status.readComposition).not.toHaveBeenCalled();
      expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    });
  it.skipIf(!process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT)('原文经实际 DSA 读取与 TS 合同后进入 Market，零网络及数据库尝试', async () => {
    const dsaRoot = process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT!;
    const { reader, protocol, post } = replayReader();
    post.mockImplementation(async (_path, body) => {
      const receipt = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'),
        [resolve('test/market/fixtures/historical-execution-offline.py'), resolve('test/market/fixtures/historical-execution.shared.json')],
        { cwd: dsaRoot, input: JSON.stringify(body), encoding: 'utf8', timeout: 15000,
          env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1', THESIS_LEDGER_FIXTURE_MODE: 'false' } }));
      expect(receipt.deniedAttempts).toEqual([]);
      return receipt.result;
    });
    const result = await reader.observe(protocol, input.asOf, [input.symbol]);
    expect(result.context.quotes[0]).toMatchObject({ lot: '100', tick: '0.001', positionAvailableOn: '2026-11-11' });
    expect(result.context.quotes[0]!.statutorySellFee!('10000', '100', '100')).toBe('0.5');
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('盘中读取快照并使用明确结算、费项和价格限制，不访问日终证明', async () => {
    const { reader, protocol, dsa, status } = replayReader();
    const result = await reader.observe(protocol, input.asOf, [input.symbol]);
    const quote = result.context.quotes[0]!;
    expect(quote).toMatchObject({ lot: '100', tick: '0.001', positionAvailableOn: '2026-11-11',
      cashAvailableOn: '2026-11-10', upperLimit: '1.600', lowerLimit: '1.000', buyBlocked: null });
    expect(quote.statutoryBuyFee!('10000', '100', '100')).toBe('0.4');
    expect(quote.statutorySellFee!('10000', '100', '100')).toBe('0.5');
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(status.readComposition).not.toHaveBeenCalled();
  });
  it('ETF 不以类型推定 T+0，结算完全取自快照', async () => {
    const value = fixture();
    if (value.fact.executionRules.status !== 'supported') throw new Error('受控规则不完整');
    value.fact.executionRules.positionSettlement.sellableAfterTradingDays = 0;
    value.fact.executionRules.cashSettlement.sellCreditAfterTradingDays = 1;
    const { reader, protocol } = replayReader(value);
    const result = await reader.observe(protocol, input.asOf, [input.symbol]);
    expect(result.context.quotes[0]).toMatchObject({ positionAvailableOn: '2026-11-10', cashAvailableOn: '2026-11-11' });
  });
  it.each(['suspended', 'halt'] as const)('%s 转成买卖阻止原因', async (kind) => {
    const context = fixture();
    if (kind === 'suspended') context.trading.state = 'suspended';
    else context.trading.intradayHalts = [{ startedAt: '2026-11-10T05:00:00Z', endedAt: null }];
    const { reader, protocol } = replayReader(context);
    const result = await reader.observe(protocol, input.asOf, [input.symbol]);
    expect(result.context.quotes[0]).toMatchObject({ buyBlocked: 'suspended', sellBlocked: 'suspended' });
  });
  it('启用后缺录继续拒绝；单纯研究不读取执行证明', async () => {
    const { reader, protocol, post, dsa } = replayReader();
    post.mockRejectedValue(new DsaV3ProtocolError('缺少该时点资料', 'insufficient-coverage'));
    await expect(reader.observe(protocol, input.asOf, [input.symbol], [], [])).resolves.toMatchObject({ context: { quotes: [] } });
    expect(post).not.toHaveBeenCalled();
    await expect(reader.observe(protocol, input.asOf, [input.symbol])).rejects.toThrow('replay_rules_unavailable');
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  });
});
