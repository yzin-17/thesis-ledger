import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  marketTradingStatusResponseV3Schema,
  type MarketTradingStatusRequestV3,
} from '@thesis-ledger/schemas';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { basicLifecycleForbidsTradeV3 } from '../../src/backtest/backtest-basic-lifecycle-v3.js';
import { statusExecutionFixture } from './trading-status-execution-fixtures.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
function source(
  request: MarketTradingStatusRequestV3,
  ipoDate: string | null,
  outDate: string | null,
) {
  const days = ['2023-08-16', '2023-08-17', '2023-08-18', '2023-08-19', '2023-08-20', '2023-08-21'];
  return marketTradingStatusResponseV3Schema.parse({
    ...request,
    status: 'supported',
    days: days.map((date) => ({ date, state: 'unknown' })),
    sourceDocuments: [],
    basicLifecycle: {
      ipoDate,
      outDate,
      ipoDateStatus: ipoDate ? 'known' : 'notProvided',
      outDateStatus: outDate ? 'known' : 'notProvided',
      sourceRecordId: 'basic',
    },
    sourceRecords: [
      {
        id: 'basic',
        kind: 'normalizedQueryResponse',
        providerId: 'baostock',
        upstreamSource: 'baostock',
        symbol: request.symbol,
        range: request.range,
        queryMethod: 'query_stock_basic',
        queryFields: 'code,ipoDate,outDate,type',
        normalizerRevision: 'baostock-basic-dates-v1',
        responseSha256: 'c'.repeat(64),
        observedAt: '2026-10-09T00:00:00Z',
      },
    ],
    structuredCoverage: {
      expectedSessions: days,
      statusUnknownDates: days,
      stUnknownDates: days,
      calendarUnknownDates: [],
      complete: false,
    },
    provenance: {
      providerId: 'baostock',
      upstreamSource: 'baostock',
      providerRevision: 'bs-basic-v1',
      datasetId: 'basic',
      fetchedAt: '2026-10-09T00:00:00Z',
      granularity: '1d',
      historicalAvailability: 'notVerified',
    },
  });
}

describe('基础日期冻结并约束真实领域 Runner，价格产物保持', () => {
  it('上市日当天允许，摘牌日当天禁止；空日期不补边界', () => {
    const life = {
      ipoDate: '2019-01-23',
      outDate: '2024-10-10',
      ipoDateStatus: 'known' as const,
      outDateStatus: 'known' as const,
      sourceRecordId: 'basic',
    };
    expect(basicLifecycleForbidsTradeV3('2019-01-22', life)).toBe(true);
    expect(basicLifecycleForbidsTradeV3('2019-01-23', life)).toBe(false);
    expect(basicLifecycleForbidsTradeV3('2024-10-09', life)).toBe(false);
    expect(basicLifecycleForbidsTradeV3('2024-10-10', life)).toBe(true);
    expect(basicLifecycleForbidsTradeV3('2024-10-11', life)).toBe(true);
    expect(basicLifecycleForbidsTradeV3('1900-01-01')).toBe(false);
  });
  it.each([
    { ipo: '2023-08-18', out: null },
    { ipo: null, out: '2023-08-18' },
    { ipo: null, out: null },
  ])('新快照使用 $ipo / $out，旧结果及离线重放保持', async ({ ipo, out }) => {
    const root = await mkdtemp(join(tmpdir(), 'basic-lifecycle-'));
    roots.push(root);
    const state = await statusExecutionFixture(root, { source: 'unknown' });
    const runner = new LocalSnapshotV3Runner(state.snapshots);
    const oldRun = {
      runId: state.input.runId,
      snapshotRef: state.built.snapshotRef,
      artifactRefs: state.built.artifactRefs,
    };
    const old = await runner.run(oldRun, new AbortController().signal);
    state.dsa.marketTradingStatusV3.mockImplementation(async (request) =>
      source(request, ipo, out),
    );
    const policy = await state.dsa.effectiveControlPolicyV3();
    Object.assign(policy.projection.effective.routes[0]!.targets[0]!, {
      providerId: 'baostock',
      upstreamSource: 'baostock',
    });
    state.dsa.effectiveControlPolicyV3.mockResolvedValue(policy);
    const input = { ...state.input, runId: `${state.input.runId}-basic` };
    const built = await state.builder.buildV3(input);
    expect(built.manifest.tradingStatus?.freezeVersion).toBe('frozen-trading-status-v5');
    state.dsa.marketTradingStatusV3.mockRejectedValue(new Error('离线禁止请求来源'));
    state.dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('离线禁止请求策略'));
    const run = {
      runId: input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const result = await runner.run(run, new AbortController().signal);
    const life =
      result.tradingStatusDisclosure?.status === 'source'
        ? result.tradingStatusDisclosure.response.basicLifecycle
        : undefined;
    expect(life).toMatchObject({ ipoDate: ipo, outDate: out });
    expect(old.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17'))).toBe(true);
    if (!ipo) expect(result.simulationFills.length).toBeGreaterThan(0);
    expect(
      result.simulationFills.every(
        (fill) => !basicLifecycleForbidsTradeV3(fill.occurredAt.slice(0, 10), life),
      ),
    ).toBe(true);
    if (ipo) expect(result.simulationFills).toHaveLength(0);
    if (!ipo && !out) {
      const economic = (fills: typeof result.simulationFills) =>
        fills.map(({ fillId, orderId, ...rest }) => {
          void fillId;
          void orderId;
          return rest;
        });
      expect(economic(result.simulationFills)).toEqual(economic(old.simulationFills));
    }
    expect(result.warnings.some((w) => w.includes('摘牌日不等于最后交易日'))).toBe(true);
    expect(await runner.run(run, new AbortController().signal)).toEqual(result);
    expect(await runner.run(oldRun, new AbortController().signal)).toEqual(old);
    expect((await state.snapshots.v3.replay(oldRun.runId)).contentHash).toBe(
      state.built.manifest.contentHash,
    );
  });
});
