import { vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { MarketTradingStatusRequestV3 } from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradingStatusInputs, tradingStatusRunConfig } from './trading-status-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

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
  const { response } = await tradingStatusInputs();
  const marketTradingStatusV3 = vi.fn(async (request: MarketTradingStatusRequestV3) => {
    if (options.source === 'failed') throw new Error('模拟状态源失败');
    const days = response.days.filter(
      (day) => day.date >= request.range.start && day.date <= request.range.end,
    );
    return {
      ...response,
      ...request,
      days:
        options.source === 'unknown'
          ? days.map((day) => ({ date: day.date, state: 'unknown' as const }))
          : days,
    };
  });
  const effectiveControlPolicyV3 = vi.fn(async () => ({
    projection: {
      effective: {
        enabled: true,
        routes:
          options.source === 'unconfigured'
            ? []
            : [
                {
                  key: response.routeKey,
                  targets: [{ ...response.routeTarget, eligible: true, reason: null }],
                },
              ],
      },
    },
  }));
  const dsa = { ...facts, marketTradingStatusV3, effectiveControlPolicyV3 };
  const snapshots = new LocalSnapshotStore(root);
  if (options.legacy) {
    const start = snapshots.v3.startBuild.bind(snapshots.v3);
    vi.spyOn(snapshots.v3, 'startBuild').mockImplementation((manifest) => {
      const old = { ...manifest };
      delete old.tradingStatus;
      if (options.legacyCost) delete old.benchmarkCostVersion;
      return start(old);
    });
    const finalize = snapshots.v3.finalize.bind(snapshots.v3);
    vi.spyOn(snapshots.v3, 'finalize').mockImplementation((runId, manifest, artifacts) =>
      finalize(
        runId,
        manifest,
        artifacts.filter((ref) => !ref.key.endsWith('/metadata/trading-status-v3.parquet')),
      ),
    );
  }
  const builder = new DsaSnapshotBuilder(
    (options.legacy ? facts : dsa) as unknown as DsaClient,
    snapshots,
    fixture.reader,
  );
  const originalConfig = structuredClone(input.runConfig);
  const built = await builder.buildV3(input);
  return { fixture, input, dsa, snapshots, builder, built, originalConfig };
};
