import { vi } from 'vitest';
import { tradingStatusArtifactKeyV3, type MarketTradingStatusResponseV3, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { compositionFixture } from '../market/status-composition-fixtures.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradingStatusInputs, tradingStatusRunConfig } from './trading-status-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { freezeStructuredStatusV3 } from '../../src/backtest/backtest-structured-status-v3.js';
import { tradingStatusArtifactRowsV3 } from '../../src/backtest/backtest-trading-status-snapshot-v3.js';

export function addArchivedStructuredStatus(
  snapshots: LocalSnapshotStore, runId: string, config: RunConfigV3, response: MarketTradingStatusResponseV3,
) {
  const { freezeVersion, structuredResearch } = freezeStructuredStatusV3(config, response);
  if (!freezeVersion) throw new Error('隔离资料没有结构化冻结版本');
  const rows = tradingStatusArtifactRowsV3({ freezeVersion, runConfigChecksum: hashCanonicalManifest(config),
    disclosure: { status: 'source', response, structuredResearch } });
  const store = snapshots.v3;
  const start = store.startBuild.bind(store);
  const finalize = store.finalize.bind(store);
  vi.spyOn(store, 'startBuild').mockImplementationOnce((manifest) => start({ ...manifest, tradingStatus: {
    freezeVersion, artifactKey: `${runId}/${tradingStatusArtifactKeyV3}`,
  } }));
  vi.spyOn(store, 'finalize').mockImplementationOnce(async (id, manifest, refs) => {
    const ref = await store.putArtifact(id, { key: tradingStatusArtifactKeyV3, rows,
      artifactId: hashCanonicalManifest({ runId: id, rows }) });
    return finalize(id, manifest, [...refs, ref]);
  });
}

export const statusExecutionFixture = async (
  root: string,
  options: {
    source?: 'known' | 'unknown' | 'failed' | 'unconfigured';
    legacy?: boolean;
    legacyCost?: boolean;
    missingBar?: boolean;
    startDate?: string;
  } = {},
) => {
  const fixture = await completeSnapshotFixture();
  const { input, dsa: facts } = fixture;
  input.runConfig = await tradingStatusRunConfig();
  input.runConfig.priceInputBindings = {
    signals: [{ sourceId: 'execution', binding: 'execution-series' }],
    benchmark: { binding: 'execution-series' },
  };
  if (options.startDate) {
    input.runConfig.startDate = options.startDate;
    input.runConfig.executionModel!.scope.range.start = options.startDate;
    input.runConfig.executionModel!.segments.forEach((segment) => {
      segment.range.start = options.startDate!;
    });
  }
  input.strategy.executionInstrument = { market: 'CN', symbol: '000995.SZ', assetType: 'stock' };
  input.strategy.signalSources.forEach((source) => {
    source.asset = input.strategy.executionInstrument;
  });
  const average = {
    type: 'indicator' as const,
    name: 'MA' as const,
    input: { type: 'series' as const, sourceId: 'execution', field: 'close' as const },
    params: { period: 1 },
  };
  input.strategy.entry = { type: 'compare', operator: 'gte', left: average.input, right: average };
  input.strategy.exit = { type: 'compare', operator: 'lt', left: average.input, right: average };
  input.executionRouteKey.assetType = 'STOCK';
  input.strategyVersionHash = hashCanonicalManifest(input.strategy);
  const missing = options.missingBar ? ['2023-08-17'] : [];
  const originalFacts = facts.backtestInstrumentFacts.getMockImplementation()!;
  facts.backtestInstrumentFacts.mockImplementation(async (request) => {
    const result = await originalFacts(request);
    if (!request.identityOnly) {
      const prices = await makeReaderResult(
        {
          symbol: request.symbol,
          market: request.market,
          routeKey: { ...input.executionRouteKey, adjustment: request.barAdjustment ?? 'qfq' },
          window: { start: request.start, end: request.end },
        },
        false,
        missing,
      );
      if (prices.status !== 'selected') throw new Error('合成行情不可用');
      result.historicalTradability = tradabilityFixtureV3(
        tradabilityWindowFromResponseV3(prices.selection.response),
      );
    }
    return result;
  });
  fixture.reader.readV3.mockImplementation((request) => makeReaderResult(request, false, missing));
  const dates = (await tradingStatusInputs()).response.days.map((day) => day.date)
    .filter((day) => day >= input.runConfig.startDate && day <= input.runConfig.endDate);
  const status = compositionFixture({ symbol: input.strategy.executionInstrument.symbol, dates });
  status.policy.routes = options.source === 'unconfigured' ? [] :
    status.policy.routes.filter((route) => route.key.capability === 'DAILY_TRADING_STATUS');
  if (options.source === 'unknown') {
    const result = status.samples.find((sample: { name: string }) => sample.name === 'DAILY_TRADING_STATUS').result;
    result.days = dates.map((date) => ({ date, state: 'unknown', intradayHalts: [], evidenceRefs: [] }));
    result.coverage.unknownDates = dates;
    result.coverage.complete = false;
  }
  if (options.source === 'failed')
    status.post.mockRejectedValue(new DsaV3ProtocolError('模拟状态源不可用', 'unavailable'));
  const dsa = { ...facts, dataCapabilities: status.reader,
    effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective: await status.readPolicy() } })) };
  const snapshots = new LocalSnapshotStore(root);
  if (options.legacyCost) {
    const start = snapshots.v3.startBuild.bind(snapshots.v3);
    vi.spyOn(snapshots.v3, 'startBuild').mockImplementation((manifest) => {
      const old = { ...manifest };
      delete old.benchmarkCostVersion;
      return start(old);
    });
  }
  const builder = new DsaSnapshotBuilder(
    (options.legacy ? facts : dsa) as unknown as DsaClient,
    snapshots,
    fixture.reader,
  );
  const originalConfig = structuredClone(input.runConfig);
  const built = await builder.buildV3(input);
  return { fixture, input, dsa, status, snapshots, builder, built, originalConfig };
};
