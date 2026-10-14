import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees } from '@thesis-ledger/domain';
import {
  backtestExecutionModelSchemaV3,
  marketPublicFeesResponseV3Schema,
  marketTradingStatusResponseV3Schema,
} from '@thesis-ledger/schemas';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';
import { intradayStatusInterpretationV3 } from '../../src/backtest/backtest-intraday-status-v3.js';
import { instrumentFact } from '../../src/backtest/backtest-v2-execution-shared.js';
import { executionBarRowsV3 } from '../../src/backtest/backtest-v3-execution-bar-rows.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import {
  skippedBacktestTradingDatesV3,
  zeroVolumeObservationWarningsV3,
} from '../../src/backtest/backtest-v3-tradability.js';
import { tradingStatusRunConfig } from './trading-status-fixtures.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import { expectedSnapshotDependencyRequestsV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
async function input(market: 'HK' | 'US') {
  const config = await tradingStatusRunConfig();
  const response = marketTradingStatusResponseV3Schema.parse(
    fixture(`market-${market.toLowerCase()}-status-v3.response.json`).response,
  );
  const model = config.executionModel!;
  model.scope = {
    ...model.scope,
    market,
    symbol: response.symbol,
    currency: market === 'HK' ? 'HKD' : 'USD',
    timezone: response.provenance.timezone!,
    range: response.range,
  };
  config.startDate = response.range.start;
  config.endDate = response.range.end;
  config.dataAsOf = '2026-10-08T00:00:00Z';
  for (const segment of model.segments) {
    segment.range = response.range;
    if (segment.execution.mode !== 'exchange' || !segment.fees) throw new Error('缺少模型');
    segment.execution.calendarMarket = market;
    segment.execution.price = { kind: 'noDailyLimit', reason: '归一化研究不应用市场日涨跌幅' };
    segment.execution.statusPolicy = { intradayHalt: 'exclude-known-halt-date-v1' };
    segment.fees.currency = model.scope.currency;
    segment.fees.commission = {
      ...segment.fees.commission,
      currency: model.scope.currency,
      rate: '0',
      minimum: { kind: 'none' },
    };
    for (const code of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'] as const)
      segment.fees[code] = { treatment: 'notApplicable', reason: '未纳入该费用' };
    segment.fees[market === 'HK' ? 'handlingFee' : 'regulatoryFee'] = {
      ...segment.fees.commission,
      side: market === 'HK' ? 'both' : 'sell',
      rate: '0',
    };
  }
  config.executionModel = backtestExecutionModelSchemaV3.parse(model);
  const rows = new Map([
    [
      'r/calendar/facts.parquet',
      [
        {
          market,
          timezone: model.scope.timezone,
          provider: 'exchange-calendars',
          providerRevision: 'test-calendar',
          availableAt: '2026-03-10T00:00:00Z',
          sessions: JSON.stringify(
            market === 'HK'
              ? [
                  { startMinute: 570, endMinute: 720 },
                  { startMinute: 780, endMinute: 960 },
                ]
              : [{ startMinute: 570, endMinute: 960 }],
          ),
          sessionOverrides: '[]',
          holidays: '[]',
          range: JSON.stringify(response.range),
        },
      ],
    ],
  ]);
  return { config, response, rows };
}

describe('港美股有界消费者', () => {
  it.each(['HK', 'US'] as const)('%s新日级来源必须绑定身份读取，旧无来源窗口不回填', async (market) => {
    const base = await completeSnapshotFixture();
    const { config } = await input(market);
    config.baseCurrency = config.executionModel!.scope.currency;
    config.initialCash = { [config.baseCurrency]: '100000' };
    config.valuationPolicy.baseTimezone = config.executionModel!.scope.timezone;
    const asset = { symbol: config.executionModel!.scope.symbol, market, assetType: 'stock' as const };
    base.input.strategy.executionInstrument = asset;
    base.input.strategy.signalSources.forEach((source) => { source.asset = asset; });
    config.executionPriceProtocol = fixture('execution-price.normalized-snapshot.json');
    for (const segment of config.executionModel!.segments) {
      if (segment.execution.mode === 'exchange') segment.execution.normalizedExecution = {
        priceCoordinate: 'continuous-decimal', quantityUnits: 'continuous-normalized-decimal',
        lotSizeConstraint: 'not-applied', tickSizeConstraint: 'not-applied', dailyPriceLimit: 'not-applied', feeBasis: 'simulatedTurnover' };
    }
    base.input.runConfig = config;
    const plan = planBacktestDependencies(base.input);
    const window = { symbol: asset.symbol,
      routeKey: { kind: 'bar', market, assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' },
      target: { providerId: 'yfinance', upstreamSource: 'yfinance', routeIndex: 0 },
      historicalTradabilityWindows: [{}], barDates: [] } as unknown as Parameters<typeof expectedSnapshotDependencyRequestsV3>[0]['tradabilityWindow'];
    const requests = expectedSnapshotDependencyRequestsV3({ ...base.input, plan, tradabilityWindow: window! });
    const fact = requests.find((request) => request.purpose === 'instrumentFacts')!;
    expect(fact.request).toMatchObject({ identityOnly: true, barAdjustment: 'qfq', barProviderId: 'yfinance', barUpstreamSource: 'yfinance', barRouteIndex: 0 });
    const legacy = { ...window! }; delete legacy.historicalTradabilityWindows;
    const old = expectedSnapshotDependencyRequestsV3({ ...base.input, plan, tradabilityWindow: legacy });
    expect(old.find((request) => request.purpose === 'instrumentFacts')!.request).not.toHaveProperty('identityOnly');
  });
  it('归一化冻结保留未知成交额，原价仍拒绝且不补造数字', async () => {
    const read = await makeReaderResult({
      market: 'CN',
      symbol: '600000.SH',
      routeKey: {
        kind: 'bar',
        market: 'CN',
        assetType: 'STOCK',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
      window: { start: '2023-08-23', end: '2023-08-29' },
    });
    if (read.status !== 'selected') throw new Error('缺少样本');
    const response = read.selection.response;
    response.bars[0]!.amount = null;
    expect(
      executionBarRowsV3(response, response.symbol, 'normalized-series')[0]!.amount,
    ).toBeNull();
    expect(() => executionBarRowsV3(response, response.symbol, 'raw-events')).toThrow('成交额');
    response.bars[0]!.volume = null;
    expect(() => executionBarRowsV3(response, response.symbol, 'normalized-series')).toThrow(
      '成交量',
    );
  });
  it('冻结零量观察不形成可执行价，原字段和摘要保留并对用户披露', async () => {
    const { config } = await input('HK');
    const evidence = {
      contractVersion: 1,
      symbol: '00147.HK',
      market: 'HK',
      instrumentType: 'STOCK',
      range: { start: config.startDate, end: config.endDate },
      listing: { status: 'unknown' },
      calendar: {
        source: { provider: 'exchange-calendars', revision: '1', availableAt: config.dataAsOf },
        expectedSessions: ['2025-08-06', '2025-08-07', '2025-08-08', '2025-08-11'],
      },
      barSource: {
        routeKey: {
          kind: 'bar',
          market: 'HK',
          assetType: 'STOCK',
          capability: 'DAILY_BAR',
          timeframe: '1d',
          adjustment: 'qfq',
        },
        routeTarget: { providerId: 'yfinance', upstreamSource: 'yfinance' },
        providerRevision: '1',
        responseSha256: 'a'.repeat(64),
        observedAt: config.dataAsOf,
        requestComplete: true,
        paginationComplete: true,
      },
      days: ['2025-08-06', '2025-08-07', '2025-08-08', '2025-08-11'].map((date) => ({
        date,
        state: date === '2025-08-07' ? 'assumed-untradable-no-bar' : 'observed-traded',
        ...(date === '2025-08-07'
          ? {
              excludedZeroVolumeObservation: {
                open: '0.265',
                high: '0.265',
                low: '0.265',
                close: '0.265',
                volume: '0',
                sourceResponseSha256: 'b'.repeat(64),
              },
            }
          : {}),
      })),
    };
    const rows = new Map<string, ArtifactRow[]>([
      [
        'r/instrumentFacts/HK-00147.HK.parquet',
        [{ historicalTradabilityWindows: JSON.stringify([evidence]) }],
      ],
      [
        'r/execution/bars.parquet',
        ['2025-08-06', '2025-08-08', '2025-08-11'].map((date) => ({
          occurredAt: `${date}T00:00:00Z`,
        })),
      ],
    ]);
    const strategy = { executionInstrument: { symbol: '00147.HK', market: 'HK' } } as Parameters<
      typeof skippedBacktestTradingDatesV3
    >[0];
    expect(skippedBacktestTradingDatesV3(strategy, config, rows, 'r')).toEqual(['2025-08-07']);
    expect(zeroVolumeObservationWarningsV3(strategy, config, rows, 'r')[0]).toContain(
      '不进入成交、信号或估值',
    );
    rows.get('r/execution/bars.parquet')!.push({ occurredAt: '2025-08-07T00:00:00Z' });
    expect(() => skippedBacktestTradingDatesV3(strategy, config, rows, 'r')).toThrow();
  });
  it.each(['HK', 'US'] as const)('%s保守日期解释按实际会话，来源不改写全天停牌', async (market) => {
    const { config, response, rows } = await input(market);
    const original = structuredClone(response);
    const result = intradayStatusInterpretationV3(config, response, rows);
    expect(result?.excludedDates).toEqual([market === 'HK' ? '2025-08-07' : '2024-05-13']);
    expect(response).toEqual(original);
    const execution = config.executionModel!.segments[0]!.execution;
    if (execution.mode === 'exchange') delete execution.statusPolicy;
    expect(intradayStatusInterpretationV3(config, response, rows)?.policy).toBe('not-modeled');
  });
  it('拒绝错误市场、时区、观察时钟或缺少原件摘要', async () => {
    const { config, response, rows } = await input('HK');
    const bad = structuredClone(response);
    bad.sourceDocuments[0]!.observedAt = '2026-10-09T00:00:00Z';
    expect(() => intradayStatusInterpretationV3(config, bad, rows)).toThrow('原件');
    const wrong = structuredClone(response);
    wrong.provenance.timezone = 'America/New_York';
    expect(() => intradayStatusInterpretationV3(config, wrong, rows)).toThrow('时区');
  });
  it.each(['HK', 'US'] as const)('%s部分费项独立计费，不补其他收费', async (market) => {
    const { config } = await input(market);
    const source = marketPublicFeesResponseV3Schema.parse(
      fixture(`market-${market.toLowerCase()}-fees-v3.response.json`).response,
    );
    const combined = combinePublicFeesExecutionModelV3(config.executionModel!, source);
    const amounts = combined.segments.map(
      (segment) =>
        calculateExecutionModelFees(segment.fees!, {
          side: 'sell',
          turnover: '100000',
          currency: combined.scope.currency,
        }).charges.find(
          (charge) => charge.code === (market === 'HK' ? 'handlingFee' : 'regulatoryFee'),
        )?.amount,
    );
    expect(amounts).toEqual(market === 'HK' ? ['5.65'] : ['0.8', '2.78']);
    expect(
      combined.segments.every((part) => part.fees!.stampDuty.treatment === 'notApplicable'),
    ).toBe(true);
    if (market === 'US') expect(combined.segments[1]!.range.start).toBe('2024-05-20');
  });
  it('未知市场单位仅供归一化坐标，原价执行仍拒绝且原件保持null', () => {
    const row = {
      symbol: 'GME.US',
      market: 'US',
      instrumentType: 'STOCK',
      currency: 'USD',
      lotSize: null,
      tickSize: null,
      tradable: false,
      provider: 'observed',
      providerRevision: '1',
      occurredAt: '2026-10-07T00:00:00Z',
      availableAt: '2026-10-07T00:00:00Z',
    };
    expect(() => instrumentFact(row)).toThrow();
    expect(instrumentFact(row, true).provider).toBe('normalized-execution-coordinate-config');
    expect(row.lotSize).toBeNull();
  });
});
