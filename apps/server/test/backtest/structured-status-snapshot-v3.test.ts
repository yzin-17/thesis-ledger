import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  marketTradingStatusResponseV3Schema,
  tradingStatusArtifactKeyV3,
  type MarketTradingStatusRequestV3,
} from '@thesis-ledger/schemas';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import {
  readSnapshotTradingStatusV3,
  tradingStatusArtifactRowsV3,
} from '../../src/backtest/backtest-trading-status-snapshot-v3.js';
import { addArchivedStructuredStatus, statusExecutionFixture } from './trading-status-execution-fixtures.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

const source = (request: MarketTradingStatusRequestV3) => {
  const id = 'daily-query';
  const observedAt = '2026-10-09T00:00:00Z';
  return marketTradingStatusResponseV3Schema.parse({
    ...request,
    status: 'supported',
    days: ['2023-08-16', '2023-08-17', '2023-08-18', '2023-08-19', '2023-08-20', '2023-08-21'].map(
      (date) => {
        if (['2023-08-19', '2023-08-20'].includes(date)) return { date, state: 'unknown' };
        return {
          date,
          state: date < '2023-08-18' ? 'suspended' : 'trading',
          coarseST: date === '2023-08-18' ? 'flagged' : 'notFlagged',
          sourceRecordIds: [id],
        };
      },
    ),
    sourceDocuments: [],
    sourceRecords: [
      {
        id,
        kind: 'normalizedQueryResponse',
        providerId: 'baostock',
        upstreamSource: 'baostock',
        symbol: request.symbol,
        range: request.range,
        queryMethod: 'query_history_k_data_plus+query_trade_dates',
        queryFields: 'date,code,tradestatus,isST',
        normalizerRevision: 'baostock-daily-flags-v1',
        responseSha256: 'a'.repeat(64),
        observedAt,
      },
    ],
    structuredCoverage: {
      expectedSessions: ['2023-08-16', '2023-08-17', '2023-08-18', '2023-08-21'],
      complete: true,
      statusUnknownDates: [],
      stUnknownDates: [],
      calendarUnknownDates: [],
    },
    provenance: {
      providerId: 'baostock',
      upstreamSource: 'baostock',
      providerRevision: 'bs-flags-v1',
      datasetId: id,
      fetchedAt: observedAt,
      granularity: '1d',
      historicalAvailability: 'notVerified',
    },
  });
};

describe('结构化来源冻结与现有执行的真实领域接缝', () => {
  it('历史结构化事实保留原执行语义，离线重放不读来源', async () => {
    const root = await mkdtemp(join(tmpdir(), 'structured-status-'));
    roots.push(root);
    const state = await statusExecutionFixture(root, { missingBar: true, legacy: true });
    const runner = new LocalSnapshotV3Runner(state.snapshots);
    const oldRun = {
      runId: state.input.runId,
      snapshotRef: state.built.snapshotRef,
      artifactRefs: state.built.artifactRefs,
    };
    const oldResult = await runner.run(oldRun, new AbortController().signal);
    const input = { ...state.input, runId: `${state.input.runId}-structured` };
    addArchivedStructuredStatus(state.snapshots, input.runId, input.runConfig, source({
      contractVersion: 1, consumer: 'thesis-ledger', requestId: 'structured-archived',
      routeKey: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
      routeTarget: { providerId: 'baostock', upstreamSource: 'baostock', routeIndex: 0 },
      symbol: input.strategy.executionInstrument.symbol,
      range: { start: input.runConfig.startDate, end: input.runConfig.endDate },
    }));
    const built = await state.builder.buildV3(input);
    expect(built.manifest.tradingStatus?.freezeVersion).toBe('frozen-trading-status-v4');
    const key = `${input.runId}/${tradingStatusArtifactKeyV3}`;
    const ref = built.artifactRefs.find((item) => item.key === key)!;
    const rows = [];
    for await (const row of await state.snapshots.artifacts.openRead(ref)) rows.push(row);
    const frozen = readSnapshotTradingStatusV3(
      { runId: input.runId, tradingStatus: built.manifest.tradingStatus! },
      input.runConfig,
      rows,
    )!;
    if (frozen.disclosure.status !== 'source') throw new Error('状态未纳入');
    expect(frozen.disclosure.response.days[0]!.state).toBe('suspended');
    expect(frozen.disclosure.response.days[2]!.coarseST).toBe('flagged');
    expect(frozen.disclosure.structuredResearch?.observedAfterPriceCutoff).toBe(true);
    expect(frozen.disclosure.response.days[2]!.dailyPriceLimit).toBeUndefined();
    state.dsa.effectiveControlPolicyV3.mockRejectedValue(new Error('禁止离线查策略'));
    const run = {
      runId: input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const result = await runner.run(run, new AbortController().signal);
    expect(result.simulationFills.some((fill) => fill.occurredAt.slice(0, 10) < '2023-08-18')).toBe(
      false,
    );
    expect(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-18'))).toBe(
      true,
    );
    expect(await runner.run(run, new AbortController().signal)).toEqual(result);
    expect(await runner.run(oldRun, new AbortController().signal)).toEqual(oldResult);
    expect((await state.snapshots.v3.replay(oldRun.runId)).contentHash).toBe(
      state.built.manifest.contentHash,
    );
    expect(state.status.post).not.toHaveBeenCalled();
    const invalid = structuredClone(frozen);
    if (invalid.disclosure.status === 'source')
      invalid.disclosure.structuredResearch!.priceDataAsOf = '2024-01-01T00:00:00Z';
    expect(() =>
      readSnapshotTradingStatusV3(
        { runId: input.runId, tradingStatus: built.manifest.tradingStatus! },
        input.runConfig,
        tradingStatusArtifactRowsV3(invalid),
      ),
    ).toThrow('截点不一致');
  });
});
