import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution-exchange.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import type { BacktestStrategy, RunConfigV3 } from '@thesis-ledger/schemas';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { isPriceResearchStrategyDefinition } from '@thesis-ledger/domain';

// 独立模拟行情；冻结后实际 Worker 只能读取本地快照，不能访问行情适配器。
export async function tradePlanSnapshot(
  root: string,
  strategy?: BacktestStrategy,
  scenario?: { dates: string[]; closes: number[]; opens?: number[]; intrabarRange?: number; dailyOrderMatching?: RunConfigV3['dailyOrderMatching'] },
) {
  const research = isPriceResearchStrategyDefinition(strategy)
    ? await priceResearchFixture()
    : undefined;
  const fixture = research ?? (await completeSnapshotFixture());
  const end = scenario?.dates.at(-1) ?? '2026-05-27';
  const observedAt = end + 'T07:02:00.000Z';
  fixture.input.runConfig.endDate = end;
  if (scenario?.dailyOrderMatching) fixture.input.runConfig.dailyOrderMatching = scenario.dailyOrderMatching;
  fixture.input.runConfig.dataAsOf = new Date(
    Date.parse(end + 'T00:00:00Z') + 86400000,
  ).toISOString();
  fixture.input.runConfig.executionPriceProtocol.priceBasis.observedAt = observedAt;
  const model = fixture.input.runConfig.executionModel!;
  model.scope.range.end = end;
  for (const segment of model.segments) segment.range.end = end;
  if (strategy) fixture.input.strategy = strategy;
  else {
    fixture.input.strategy.entry = {
      type: 'not',
      expression: { type: 'positionState', field: 'isOpen' },
    };
    fixture.input.strategy.exit = {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    };
    fixture.input.strategy.risk = [];
    fixture.input.strategy.tradePlan = {
      version: 1,
      evaluation: 'barClose',
      initialStop: { kind: 'percent', percent: '0.05' },
      trailing: { drawdownPercent: '0.05', activationGainPercent: '0.1' },
      cooldown: { bars: 10, stopBars: 10 },
      stages: [
        {
          id: 'half',
          trigger: { kind: 'gainPercent', value: '0.08' },
          action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
        },
      ],
    };
  }
  fixture.input.runConfig.priceInputBindings!.signals = collectUsedSignalSources(
    fixture.input.strategy,
  ).map((source) => ({ sourceId: source.id, binding: 'execution-series' as const }));
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  const original = fixture.reader.readV3.getMockImplementation()!;
  const dates = scenario?.dates ?? [
    '2026-05-18',
    '2026-05-19',
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-25',
    '2026-05-26',
    '2026-05-27',
  ];
  const closes = scenario?.closes ?? [10, 10, 11, 12, 11, 8, 8, 8];
  fixture.reader.readV3.mockImplementation(async (request) => {
    const result = await original(request);
    if (result.status === 'selected') {
      const response = result.selection.response;
      response.sourcePriceBasis.observedAt = observedAt;
      for (const bar of response.bars) {
        const n = dates.indexOf(bar.timestamp.slice(0, 10));
        bar.open = scenario?.opens?.[n] ?? closes[Math.max(0, n - 1)] ?? 10;
        bar.close = closes[n] ?? 10;
        bar.high = Math.max(bar.open, bar.close) + (scenario?.intrabarRange ?? 0);
        bar.low = Math.min(bar.open, bar.close) - (scenario?.intrabarRange ?? 0);
        bar.availableAt = response.sourcePriceBasis.observedAt;
      }
      if (research) {
        if (result.request.tradabilityMode) {
          response.historicalTradabilityWindows = [
            tradabilityFixtureV3(
              tradabilityWindowFromResponseV3(response),
              result.request.dailyObservationContract,
            ),
          ];
        }
        result.evidence.routeKey = request.routeKey;
        result.evidence.sourcePriceBasis = response.sourcePriceBasis;
        result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
        if (request.frozenWindowRef) result.frozenWindowRef = request.frozenWindowRef;
      }
    }
    return result;
  });
  if (research) {
    const c = fixture.input.runConfig;
    const prepared = await prepareBacktestRunConfigV3({
      request: {
        ...research.request,
        runConfig: {
          ...research.request.runConfig,
          startDate: c.startDate,
          endDate: c.endDate,
          dataAsOf: c.dataAsOf,
          executionModel: model,
          ...(c.dailyOrderMatching ? { dailyOrderMatching: c.dailyOrderMatching } : {}),
        },
      },
      strategy: fixture.input.strategy,
      reader: fixture.reader,
      control: research.control,
      checkedAt: c.dataAsOf,
    });
    if (prepared.status !== 'prepared')
      throw new Error('独立三版样本准备失败：' + JSON.stringify(prepared));
    fixture.input.runConfig = prepared.runConfig;
    fixture.input.executionRouteKey.adjustment = 'hfq';
  }
  return freezeTradePlanFixture(root, fixture);
}

export async function freezeTradePlanFixture(
  root: string,
  fixture:
    | Awaited<ReturnType<typeof completeSnapshotFixture>>
    | Awaited<ReturnType<typeof priceResearchFixture>>,
) {
  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  ).buildV3(fixture.input);
  fixture.reader.readV3.mockImplementation(() => {
    throw new Error('冻结后的执行禁止读取新行情');
  });
  const runner = new LocalSnapshotV3Runner(snapshots);
  const input = {
    runId: fixture.input.runId,
    snapshotRef: built.snapshotRef,
    artifactRefs: built.artifactRefs,
  };
  const rows = new Map<string, readonly ArtifactRow[]>();
  for (const ref of built.artifactRefs) {
    const values: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(ref)) values.push(row);
    rows.set(ref.key, values);
  }
  const execute = () =>
    runExchangeVertical({
      runId: input.runId,
      strategyVersionId: fixture.input.strategyVersionId,
      snapshotId: built.snapshotRef.snapshotId,
      strategy: fixture.input.strategy,
      runConfig: fixture.input.runConfig,
      artifacts: built.artifactRefs,
      rows,
      engineVersion: 'trade-plan-acceptance',
      marketRuleVersion: built.manifest.marketRuleVersion,
      calendarVersion: built.manifest.calendarVersion,
      aggregationVersion: built.manifest.aggregationVersion,
    });
  return {
    fixture,
    built,
    snapshots,
    execute,
    run: () => runner.run(input, new AbortController().signal),
  };
}
