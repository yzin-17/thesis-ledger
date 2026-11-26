import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  barPointSchema, effectiveProviderPolicyV3Schema, historicalExecutionResultSchema,
} from '@thesis-ledger/schemas';
import { readHistoricalExecution } from '../../src/integration/dsa/dsa-historical-execution.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { projectPeriodCalendar } from '../../src/market/market-period-calendar-projection.js';
import { liveProtocolFixture } from '../model-arena/live-fixture.js';

// 仅复用协议路由和隔离内部 ID；业务事实全部由真实原文和已核验版本的日历生成。
const envelope = JSON.parse(readFileSync(new URL('./fixtures/historical-execution.shared.json', import.meta.url), 'utf8')).request;
const asOf = '2026-11-10T05:01:00.000Z';
const policy = effectiveProviderPolicyV3Schema.parse({
  contractVersion: 1, consumer: 'thesis-ledger', requestId: 'real-evidence-offline',
  revision: 1, sourceDesiredRevision: 1, enabled: true, appliedAt: '2026-11-16T00:00:00.000Z',
  routes: [{ key: envelope.routeKey, enabled: true, reason: null,
    targets: [{ ...envelope.routeTarget, eligible: true, reason: null }] }],
});
const disabled = !process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT || !process.env.ARENA_REAL_EXECUTION_SOURCES_ROOT;

describe('真实 ETF 材料贯通 DSA、TS 合同与 Market', () => {
  it.skipIf(disabled).each([
    { symbol: '588000.SH', listing: '2020-11-16', price: '1.343', lower: '1.062', upper: '1.592' },
    { symbol: '510300.SH', listing: '2012-05-28', price: '4.133', lower: '3.717', upper: '4.543' },
  ])('$symbol 使用真实上市、日历、行情及制度', async item => {
    const dsaRoot = process.env.ARENA_HISTORY_OFFLINE_DSA_ROOT!;
    const receipt = JSON.parse(execFileSync(resolve(dsaRoot, '.venv/bin/python'), [
      resolve('test/market/fixtures/historical-execution-real-offline.py'),
      process.env.ARENA_REAL_EXECUTION_SOURCES_ROOT!,
    ], { cwd: dsaRoot, input: JSON.stringify({ ...envelope, symbol: item.symbol, asOf }),
      encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONPATH: dsaRoot, PYTHONDONTWRITEBYTECODE: '1', THESIS_LEDGER_FIXTURE_MODE: 'false' } }));
    expect(receipt.deniedAttempts).toEqual([]);
    const execution = historicalExecutionResultSchema.parse(receipt.result).context;
    expect(execution.trading).toMatchObject({ state: 'trading', basis: {
      listing: { listedOn: item.listing, delistedOn: null }, query: { symbol: item.symbol, total: 0, pages: 1 },
    } });
    expect(execution.evidence.every(e => !e.reference.includes('.invalid'))).toBe(true);
    const calendar = projectPeriodCalendar(receipt.calendar, {
      market: 'CN', start: '2026-10-27', end: '2026-11-24', evaluationAsOf: asOf,
    });
    expect(calendar.status).toBe('ready');
    if (calendar.status !== 'ready') throw new Error('真实日历投影失败');
    expect(calendar.calendar.sessions.filter(s => ['2026-11-07', '2026-11-08'].includes(s.tradingDate))).toEqual([]);
    expect(calendar.calendar.sessions.filter(s => s.tradingDate === '2026-11-10')).toEqual([
      { tradingDate: '2026-11-10', startAt: '2026-11-10T01:30:00.000Z', endAt: '2026-11-10T03:30:00.000Z' },
      { tradingDate: '2026-11-10', startAt: '2026-11-10T05:00:00.000Z', endAt: '2026-11-10T07:00:00.000Z' },
    ]);
    const observation = receipt.observation;
    const points = observation.points.map((p: unknown) => barPointSchema.parse(p));
    expect(points).toHaveLength(122);
    expect(receipt.audit.excludedFutureRows).toBe(119);
    expect(points.every((p: { timestamp: string }) => Date.parse(p.timestamp) <= Date.parse(asOf))).toBe(true);
    const post = vi.fn(async (_path: string, body: object) => ({ ...body, context: execution }));
    const dsa = { backtestInstrumentFacts: vi.fn(), historicalExecution: (input: {
      symbol: string; assetType: 'STOCK' | 'ETF'; asOf: string;
    }) => readHistoricalExecution(input, async () => policy, post) };
    const status = { readComposition: vi.fn() };
    const bars = { readRetainedResearch: vi.fn() };
    const reader = new MarketArenaReplayReader({ read: vi.fn(async () => calendar) }, bars,
      dsa, status, { read: vi.fn(async () => []) }, {
        resolve: vi.fn(async () => [{ instrumentId: '11111111-1111-4111-8111-111111111111',
          symbol: item.symbol, assetType: 'ETF' as const, name: observation.name }]),
        prices: vi.fn(async () => ({ points, seriesVersion: observation.seriesVersion, evidence: {
          kind: 'reconstructed-minutes' as const,
          archiveRef: `private-offline/originals/${observation.source.sha256}`,
          observedAt: observation.source.observedAt, responseSha256: observation.source.sha256,
          providerId: 'sse-official', policyRevision: 1, timestampConvention: 'interval-end' as const,
        } })),
      });
    const protocol = liveProtocolFixture({ market: 'CN', currency: 'CNY', budgetCurrency: 'CNY', timeZone: 'Asia/Shanghai' });
    const result = await reader.observe(protocol, asOf, [item.symbol]);
    const quote = result.context.quotes[0]!;
    expect(quote).toMatchObject({ symbol: item.symbol, price: item.price, lot: '100', tick: '0.001',
      lowerLimit: item.lower, upperLimit: item.upper, positionAvailableOn: '2026-11-11',
      cashAvailableOn: '2026-11-10', buyBlocked: null, sellBlocked: null });
    expect(quote.statutoryBuyFee!('10000', '100', '100')).toBe('0.4');
    expect(quote.statutorySellFee!('10000', '100', '100')).toBe('0.4');
    expect(post).toHaveBeenCalledTimes(1);
    expect(bars.readRetainedResearch).not.toHaveBeenCalled();
    expect(status.readComposition).not.toHaveBeenCalled();
    expect(dsa.backtestInstrumentFacts).not.toHaveBeenCalled();
  });
});
