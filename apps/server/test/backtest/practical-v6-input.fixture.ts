import { expect, vi } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type BacktestStrategy,
  type NumericExpression,
  runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { additionalSignalPricePlanV3 } from '../../src/backtest/backtest-signal-price-plan-v3.js';
import { assertStrategyResearchScopeV3 } from '../../src/backtest/backtest-research-data-scope-v3.js';
import type {
  MarketBarWindowReadInputV3,
  MarketBarWindowReadResultV3,
} from '../../src/market/market-bar-reader-v3.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { multitimeframeFixture } from './expression-multitimeframe.fixture.js';
import { freezeTradePlanFixture } from './trade-plan-snapshot.fixture.js';
import { deriveFrozenMarketWindowViewV3 } from '../../src/market/market-frozen-window-view-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';

/** 模型发送前取得全部窗口；发送后只允许从这批冻结响应读取，不扩充字段、周期或窗口。 */
export async function practicalV6Input(
  root: string,
  kind: 'daily' | 'hourly' | 'session' | 'hfq-only',
  replaySource?: string,
) {
  const research = await priceResearchFixture();
  const fixture =
    !replaySource && (kind === 'hourly' || kind === 'session')
      ? await multitimeframeFixture(kind === 'session' ? '60m' : '1d')
      : research;
  const timeframe = kind === 'session' ? ('1m' as const) : ('1d' as const);
  const scope = {
    executionInstrument: research.input.strategy.executionInstrument,
    primaryTimeframe: timeframe,
  };
  const seed = {
    ...createDiscoverySeed(scope, true),
    cost: { commissionRate: '0.0003', slippageRate: '0.001' },
  };
  const planning = structuredClone(seed);
  planning.signalSources = [timeframe, ...(kind === 'hourly' ? ['60m' as const] : [])].map(
    (period, i) => ({
      id: `reserved-${i}`,
      asset: scope.executionInstrument,
      timeframe: period,
      priceCoordinate: 'research',
      series:
        kind === 'hourly' || kind === 'session'
          ? ['open', 'high', 'low', 'close', 'volume']
          : ['open', 'high', 'low', 'close'],
    }),
  );
  planning.entry = {
    type: 'all',
    conditions: planning.signalSources.flatMap((source) =>
      source.series.map((field) => ({
        type: 'compare' as const,
        operator: 'gte' as const,
        left: { type: 'series' as const, sourceId: source.id, field } as NumericExpression,
        right: { type: 'series' as const, sourceId: source.id, field } as NumericExpression,
      })),
    ),
  };
  fixture.input.strategy = planning;
  fixture.dsa = research.dsa;
  fixture.input.strategyVersionHash = hashCanonicalManifest(planning);
  const rawRead = fixture.reader.readV3.getMockImplementation()!;
  const cache = new Map<string, MarketBarWindowReadResultV3>();
  const key = (input: MarketBarWindowReadInputV3) =>
    hashCanonicalManifest({
      routeKey: input.routeKey,
      symbol: input.symbol,
      window: input.window,
      dailyObservationContract: input.dailyObservationContract,
    });
  const recorded = replaySource
    ? JSON.parse(readFileSync(resolve(replaySource, 'frozen-inputs.json'), 'utf8'))
    : null;
  if (recorded)
    for (const value of recorded.windows as MarketBarWindowReadResultV3[]) {
      if (value.status !== 'selected') continue;
      value.evidence.fetchedAt = new Date(value.evidence.fetchedAt);
      cache.set(
        key({
          routeKey: value.request.routeKey,
          market: value.request.routeKey.market,
          symbol: value.request.symbol,
          window: { start: value.request.start, end: value.request.end },
          ...(value.request.dailyObservationContract === undefined
            ? {}
            : { dailyObservationContract: value.request.dailyObservationContract }),
        }),
        value,
      );
    }
  const frozenRead = async (
    input: MarketBarWindowReadInputV3,
  ): Promise<Extract<MarketBarWindowReadResultV3, { status: 'selected' }>> => {
    const saved = input.frozenWindowRef
      ? [...cache.values()].find(
          (value) =>
            value.status === 'selected' &&
            value.evidence.completeResponseHash === input.frozenWindowRef!.responseHash,
        )
      : cache.get(key(input));
    if (!saved || saved.status !== 'selected')
      throw new Error('候选尝试读取预先冻结范围外的数据：' + JSON.stringify(input));
    const parent = structuredClone(saved);
    const responseHash = parent.evidence.completeResponseHash;
    if (!responseHash) throw new Error('预检窗口缺少完整响应哈希');
    const reference = input.frozenWindowRef ?? {
      version: 'market-frozen-window-v1' as const,
      identityFingerprint: parent.evidence.identityFingerprint,
      responseHash,
    };
    const view = deriveFrozenMarketWindowViewV3(
      {
        request: parent.request,
        response: parent.selection.response,
        evidence: parent.evidence,
        completeResponseHash: responseHash,
        seriesVersion: parent.seriesVersion,
      },
      reference,
      input,
    );
    const response = view.response;
    return {
      ...parent,
      request: view.request,
      seriesVersion: view.seriesVersion,
      frozenWindowRef: reference,
      selection: { ...parent.selection, response },
      evidence: {
        ...parent.evidence,
        window: input.window,
        seriesVersion: view.seriesVersion,
        identityFingerprint: hashCanonicalManifest({ reference, window: input.window }),
        completeResponseHash: marketFrozenWindowHashV3(response),
        inputFingerprint: response.inputFingerprint,
        sourcePriceBasis: response.sourcePriceBasis,
        coverageProof: response.coverageProof,
      },
    };
  };
  fixture.reader.readV3.mockImplementation(async (input) => {
    if (kind !== 'daily' && input.routeKey.adjustment === 'none')
      return {
        status: 'unavailable',
        selection: { status: 'unavailable', reason: 'route_not_configured' },
      } as MarketBarWindowReadResultV3;
    if (input.frozenWindowRef) return frozenRead(input);
    const result = await rawRead(input);
    cache.set(key(input), structuredClone(result));
    return result;
  });
  const request = {
    ...research.request,
    warmupBudgetSessions: 120,
    priceResearchReference: 'optional' as const,
  };
  if (kind === 'session') {
    const policy = await research.control.getPolicy();
    research.control.getPolicy.mockResolvedValue({
      ...policy,
      routes: policy.routes.map((route) => ({
        ...route,
        key: { ...route.key, capability: 'MINUTE_BAR', timeframe: '1m' },
      })),
    } as typeof policy);
  }
  const prepared = recorded
    ? { status: 'prepared' as const, runConfig: runConfigSchemaV3.parse(recorded.runConfig) }
    : await prepareBacktestRunConfigV3({
        request,
        strategy: planning,
        reader: fixture.reader,
        control: research.control,
        checkedAt: fixture.input.runConfig.dataAsOf,
        ...('researchCalendar' in fixture ? { researchCalendar: fixture.researchCalendar } : {}),

      });
  expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
  if (prepared.status !== 'prepared') throw new Error('验收窗口未准备');
  const runConfig = prepared.runConfig;
  fixture.input.runConfig = runConfig;
  fixture.input.executionRouteKey.adjustment = 'hfq';
  fixture.reader.readV3.mockImplementation(frozenRead);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(root, 'frozen-inputs.json'),
    JSON.stringify({ kind, runConfig, windows: [...cache.values()] }),
    { flag: 'wx', mode: 0o600 },
  );
  if (!recorded) {
    const baseline = await freezeTradePlanFixture(resolve(root, 'preflight'), fixture);
    expect(await baseline.run()).toEqual(await baseline.run());
  }
  const freeze = async (directory: string, strategy: BacktestStrategy) => {
    assertStrategyResearchScopeV3(strategy, runConfig);
    const config = runConfigSchemaV3.parse({
      ...runConfig,
      priceInputBindings: {
        signals: planBacktestDependencies({ strategy, runConfig }).signalSources.map(({ id }) => ({
          sourceId: id,
          binding:
            strategy.signalSources.find((source) => source.id === id)?.priceCoordinate === 'actual'
              ? 'actual-price-series'
              : 'execution-series',
        })),
        benchmark: { binding: 'execution-series' },
      },
    });
    const physical = new Set(
      additionalSignalPricePlanV3(strategy, config).map((plan) => plan.artifactKey),
    );
    if (config.signalPriceWindows)
      config.signalPriceWindows = config.signalPriceWindows.filter((window) =>
        physical.has(window.artifactKey),
      );
    fixture.input = {
      ...fixture.input,
      strategy,
      strategyVersionHash: hashCanonicalManifest(strategy),
      runConfig: config,
    };
    fixture.reader.readV3.mockImplementation(frozenRead);
    return freezeTradePlanFixture(directory, {
      ...research,
      input: fixture.input,
      dsa: fixture.dsa,
      reader: { readV3: vi.fn(frozenRead) },
    });
  };
  return { seed, scope, runConfig, freeze };
}
