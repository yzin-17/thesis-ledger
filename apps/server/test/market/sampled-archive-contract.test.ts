import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  arenaSubmitDecision, arenaMatchOrders, arenaAvailableCash,
  type ArenaPaperDecision,
} from '@thesis-ledger/domain';
import {
  effectiveProviderPolicyV3Schema, historicalExecutionResultSchema,
  type HistoricalExecutionRequest,
} from '@thesis-ledger/schemas';
import { readHistoricalExecution } from '../../src/integration/dsa/dsa-historical-execution.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/arena-sampled-frozen-business.json', import.meta.url), 'utf8'));
const dsaRoot = resolve(process.cwd(), '../../../daily-stock-analysis');
const script = resolve(process.cwd(), 'test/market/fixtures/historical-execution-sampled-offline.py');
const blocked = vi.fn(() => { throw new Error('unexpected_external_operation'); });
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockImplementation(blocked); });
afterEach(() => { expect(blocked).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function policy() {
  return effectiveProviderPolicyV3Schema.parse({ contractVersion: 1, consumer: 'thesis-ledger', requestId: 'offline',
    revision: 1, sourceDesiredRevision: 1, enabled: true, appliedAt: '2026-11-25T00:00:00Z', routes: [{
      key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'HISTORICAL_EXECUTION_CONTEXT' },
      enabled: true, reason: null, targets: [{ providerId: 'historical-execution-archive',
        upstreamSource: 'qualified-cn-execution', routeIndex: 0, eligible: true, reason: null }],
    }] });
}
function post(mode: 'native' | 'daily') {
  return async (_path: string, body: HistoricalExecutionRequest) => {
    const receipt = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'), [script, mode], {
      cwd: dsaRoot, input: JSON.stringify(body), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1' },
    }));
    expect(receipt.externalCalls).toBe(0);
    expect(receipt.modelCalls).toBe(0);
    expect(receipt.temporaryDatabaseConnections).toBeGreaterThan(0);
    return receipt.result;
  };
}

it.each(['native', 'daily'] as const)('%s 临时 DSA 运行时到主仓合同只交付必要字段', async (mode) => {
  const context = await readHistoricalExecution({ symbol: '588000.SH', assetType: 'ETF',
    asOf: '2026-11-10T05:01:00.000Z', purpose: 'sampled' }, async () => policy(), post(mode));
  expect(context?.trading.state).toBe('trading');
  expect(context?.fact.lotSize).toBe('100');
  expect(context).toHaveProperty('identityEvidenceRefs');
  expect(context).not.toHaveProperty('ruleCoverage');
  expect(context).not.toHaveProperty('priceRule');
  expect(context?.fact).not.toHaveProperty('executionRules');
  expect(historicalExecutionResultSchema.safeParse({
    contractVersion: 1, consumer: 'thesis-ledger', requestId: 'purpose-mismatch',
    routeKey: policy().routes[0]!.key,
    routeTarget: { providerId: 'historical-execution-archive', upstreamSource: 'qualified-cn-execution', routeIndex: 0 },
    policyRevision: 1, symbol: '588000.SH', asOf: context!.asOf, purpose: 'full', context,
  }).success).toBe(false);
});

it('两证券均能消费已存官方状态重建，未知交易单位仍被拒绝', async () => {
  const context = await readHistoricalExecution({ symbol: '510300.SH', assetType: 'ETF',
    asOf: '2026-11-10T05:01:00.000Z', purpose: 'sampled' }, async () => policy(), post('daily'));
  expect(context!.fact.symbol).toBe('510300.SH');
  const request: HistoricalExecutionRequest = { contractVersion: 1, consumer: 'thesis-ledger', requestId: 'bad-unit',
    routeKey: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'HISTORICAL_EXECUTION_CONTEXT' },
    routeTarget: { providerId: 'historical-execution-archive', upstreamSource: 'qualified-cn-execution', routeIndex: 0 },
    policyRevision: 1, symbol: '510300.SH', asOf: context!.asOf, purpose: 'sampled' };
  expect(historicalExecutionResultSchema.safeParse({ ...request,
    context: { ...context, fact: { ...context!.fact, lotSize: 'bad' } } }).success).toBe(false);
});

it('精简归档穿过 Market 完成真实分钟买入，受控次日报价验证可卖与卖款再投资', async () => {
  const p = liveProtocolFixture({ simulationPolicy: 'sampled-v1', market: 'CN', currency: 'CNY',
    timeZone: 'Asia/Shanghai', universe: 'fixed', initialCash: '100000', instruments: [{
      instrumentId: '11111111-1111-4111-8111-111111111111', symbol: '588000.SH', assetType: 'ETF',
    }] });
  const transport = vi.fn(post('daily'));
  const reader = new MarketArenaReplayReader({ read: vi.fn(async ({ start, end }: { start: string; end: string }) => ({ status: 'ready',
    calendar: { ...sample.calendar, coverageStart: start, coverageEnd: end,
      sessions: sample.calendar.sessions.filter((s: { tradingDate: string }) => s.tradingDate >= start && s.tradingDate <= end) },
  })) } as never, { readRetainedResearch: vi.fn(async () => ({ status: 'selected',
    selection: { response: { bars: sample.points } }, seriesVersion: sample.sourceRef, evidence: sample.receipts,
  })) } as never, {
    historicalExecution: (input) => readHistoricalExecution(input, async () => policy(), transport),
    backtestInstrumentFacts: blocked,
  }, { readComposition: blocked }, { read: vi.fn(async () => ['coverage_unverified']) });
  const at = '2026-11-10T05:01:00.000Z';
  const first = await reader.observe(p, at, ['588000.SH']);
  const q = first.context.quotes[0]!;
  expect(q.positionAvailableOn).toBe('2026-11-11');
  expect(q.cashAvailableOn).toBe('2026-11-10');
  expect(q.upperLimit).toBeUndefined();
  const d: ArenaPaperDecision = { summary: '精简归档隔离闭环', cancelOrderIds: [], watchedSymbols: [],
    wakeups: [{ kind: 'fill', symbol: q.symbol }], orders: [{
    clientId: 'buy', symbol: q.symbol, side: 'buy', kind: 'market', quantity: '100',
    price: null, expiresOn: null, exitGroup: null,
  }] };
  const booked = arenaSubmitDecision(sample.account, sample.account.revision, d, first.context);
  const next = await reader.observe(p, '2026-11-10T05:02:00.000Z', ['588000.SH']);
  const bought = arenaMatchOrders(booked, next.context, true);
  expect(bought.fills).toHaveLength(1);
  expect(bought.fills[0]!.fee).toBe('0');
  expect(arenaMatchOrders(bought, next.context, true)).toEqual(bought);
  d.orders[0] = { ...d.orders[0]!, clientId: 'sell', side: 'sell' };
  expect(() => arenaSubmitDecision(bought, bought.revision, d, next.context)).toThrow('insufficient_position');
  // 次日报价为明确受控输入，只验证结算规则，不认证次日真实行情／归档覆盖。
  const controlled = { ...next.context, at: '2026-11-11T05:01:00Z', tradingDate: '2026-11-11',
    quotes: [{ ...q, sourceRef: 'controlled-next-day-reinvestment', tradingDate: '2026-11-11',
      positionAvailableOn: '2026-11-12', cashAvailableOn: '2026-11-11',
      marketTime: '2026-11-11T05:01:00Z', observedAt: '2026-11-11T05:01:00Z' }],
    expiresAt: () => '2026-11-11T07:00:00Z',
  };
  const selling = arenaSubmitDecision(bought, bought.revision, d, controlled);
  const afterSell = { ...controlled, at: '2026-11-11T05:02:00Z',
    quotes: controlled.quotes.map(v => ({ ...v, marketTime: '2026-11-11T05:02:00Z', observedAt: '2026-11-11T05:02:00Z' })),
  };
  const sold = arenaMatchOrders(selling, afterSell, true);
  expect(sold.fills).toHaveLength(2);
  expect(sold.positions).toEqual([]);
  expect(sold.cashSettlements).toEqual([]);
  expect(arenaAvailableCash(sold, '2026-11-11')).toBe(sold.cash);
  d.orders[0] = { ...d.orders[0]!, clientId: 'reinvest', side: 'buy' };
  expect(arenaSubmitDecision(sold, sold.revision, d, afterSell).orders.at(-1)!.state).toBe('active');
  expect(transport.mock.calls.every(([, body]) => body.purpose === 'sampled')).toBe(true);
}, 15000);
