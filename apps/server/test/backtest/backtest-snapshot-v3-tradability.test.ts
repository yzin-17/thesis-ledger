import { describe, expect, it } from 'vitest';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import {
  freezeTradabilityRowsV3,
  tradabilityWindowFromResponseV3,
  validateSnapshotTradabilityV3,
  tradabilityExpectedBarDatesV3,
} from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import {
  collectSnapshotDependenciesV3,
  expectedSnapshotDependencyRequestsV3,
  validateSnapshotDependencyArtifactsV3,
} from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';

async function fixture() {
  const { input, dsa } = await completeSnapshotFixture();
  const plan = planBacktestDependencies(input);
  const range = { start: plan.warmup.startDate, end: input.runConfig.endDate };
  const selected = await makeReaderResult({
    symbol: input.strategy.executionInstrument.symbol,
    market: 'CN',
    routeKey: {
      kind: 'bar',
      market: 'CN',
      assetType: 'ETF',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    window: range,
  });
  if (selected.status !== 'selected') throw new Error('fixture 行情不可用');
  const window = tradabilityWindowFromResponseV3(selected.selection.response);
  const dependency = { ...input, plan, tradabilityWindow: window };
  const request = expectedSnapshotDependencyRequestsV3(dependency).find(
    (entry) => entry.purpose === 'instrumentFacts',
  )!;
  if (request.purpose !== 'instrumentFacts') throw new Error('fixture 请求类型不符');
  const response = await dsa.backtestInstrumentFacts(request.request);
  return { input, dsa, range, window, response, dependency, request };
}

describe('Server 逐日可交易性来源绑定与冻结', () => {
  it('使用实际选中来源成组请求并冻结完整证据，断网后可核验', async () => {
    const f = await fixture();
    expect(f.request.request).toMatchObject({
      barAdjustment: 'qfq',
      barProviderId: 'hithink',
      barUpstreamSource: 'hithink-financial-api',
      barRouteIndex: 0,
    });
    const result = await collectSnapshotDependenciesV3(f.dependency, f.dsa);
    f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    const replay = validateSnapshotDependencyArtifactsV3(f.dependency, result.artifacts);
    const row = replay.artifacts.find(({ key }) => key.startsWith('instrumentFacts/'))!.rows[0]!;
    expect(JSON.parse(String(row.historicalTradability))).toEqual(f.response.historicalTradability);
    const damaged = structuredClone(result.artifacts);
    damaged.find(({ key }) => key.startsWith('instrumentFacts/'))!.rows[0]!.historicalTradability =
      '{}';
    expect(() => validateSnapshotDependencyArtifactsV3(f.dependency, damaged)).toThrow(/事实行/);
  });

  it('仅在实际冻结 Bar 同样缺日时接受假设不可交易状态，零 Bar 汇总为 false', async () => {
    const f = await fixture();
    f.window.barDates = f.window.barDates.filter((_, index) => index !== 1);
    f.response.historicalTradability = tradabilityFixtureV3(f.window);
    expect(() =>
      validateSnapshotTradabilityV3(f.window, f.input.runConfig, f.range, f.response),
    ).not.toThrow();
    f.window.barDates = [];
    f.response.historicalTradability = tradabilityFixtureV3(f.window);
    f.response.facts.forEach((fact) => {
      fact.tradable = false;
    });
    expect(() =>
      validateSnapshotTradabilityV3(f.window, f.input.runConfig, f.range, f.response),
    ).not.toThrow();
  });

  it.each([
    'missing',
    'source',
    'adjustment',
    'listing',
    'calendar',
    'dates',
    'revision',
    'future',
    'pit',
    'summary',
  ])('拒绝 %s 证据', async (mode) => {
    const f = await fixture();
    const evidence = f.response.historicalTradability!;
    if (mode === 'missing') delete f.response.historicalTradability;
    if (mode === 'source') evidence.barSource.routeTarget.providerId = 'other';
    if (mode === 'adjustment') evidence.barSource.routeKey.adjustment = 'none';
    if (mode === 'listing') evidence.listing.source.revision = 'other';
    if (mode === 'calendar') evidence.calendar.source.revision = 'other';
    if (mode === 'dates') evidence.days[0]!.state = 'assumed-untradable-no-bar';
    if (mode === 'revision') evidence.barSource.providerRevision = 'unknown';
    if (mode === 'future') evidence.barSource.observedAt = '2027-01-01T00:00:00Z';
    if (mode === 'pit')
      f.input.runConfig.executionPriceProtocol.history = {
        basis: 'point-in-time',
        reconstructionEvidenceRef: 'qualified-price-only',
      };
    if (mode === 'summary') f.response.facts[0]!.tradable = false;
    expect(() =>
      validateSnapshotTradabilityV3(f.window, f.input.runConfig, f.range, f.response),
    ).toThrow();
  });

  it('冻结行保留来源摘要，修改证据后重放拒绝', async () => {
    const f = await fixture();
    const result = await collectSnapshotDependenciesV3(f.dependency, f.dsa);
    const proof = result.artifacts
      .find(({ key }) => key.startsWith('metadata/'))!
      .rows.find((row) => row.purpose === 'instrumentFacts')!;
    const response = JSON.parse(String(proof.response));
    response.historicalTradability.barSource.responseSha256 = 'b'.repeat(64);
    proof.response = JSON.stringify(response);
    expect(() => validateSnapshotDependencyArtifactsV3(f.dependency, result.artifacts)).toThrow();
    const rows = [{}];
    freezeTradabilityRowsV3(rows, f.response);
    expect(rows).toHaveLength(1);
  });

  it('独立日历不能将缺失 Bar 日当作休市日掩盖', async () => {
    const f = await fixture();
    const rows = [{ historicalTradability: JSON.stringify(f.response.historicalTradability) }];
    expect(
      tradabilityExpectedBarDatesV3(rows, f.window.coverageProof.calendar.expectedSessionDates),
    ).toEqual(f.window.barDates);
    expect(() => tradabilityExpectedBarDatesV3(rows, f.window.barDates.slice(1))).toThrow(
      /独立交易日历/,
    );
  });

  it('来源撤销导致依赖不可用，不产生冻结结果', async () => {
    const f = await fixture();
    f.dsa.backtestInstrumentFacts.mockResolvedValue({
      ...f.response,
      status: 'unavailable',
      reason: 'route admission revoked',
      facts: [],
      coverage: { ...f.response.coverage, complete: false },
    });
    await expect(collectSnapshotDependenciesV3(f.dependency, f.dsa)).rejects.toThrow(/revoked/);
  });
});
