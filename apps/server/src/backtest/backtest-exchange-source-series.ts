import { signalPriceArtifactKeyV3 } from './backtest-signal-price-plan-v3.js';
import { tradingCalendarFromFact, type BacktestSeries } from '@thesis-ledger/domain';
import { lifecycleWarmupRowV3 } from './backtest-lifecycle-execution-v3.js';
import {
  calendarFact,
  rowFor,
  rowsAtTimeframe,
  type rowsForPurpose,
  signalArtifactFor,
  sourceSeriesKey,
  type BacktestVerticalInput,
} from './backtest-v2-execution-shared.js';
import { barResearchClocksV3 } from './backtest-v3-research-clock.js';
import { intradayBarSessionWindow } from './backtest-intraday-bar-session.js';

export function frozenExchangeSignalSeries(
  input: BacktestVerticalInput,
  calendarRows: ReturnType<typeof rowsForPurpose>,
  barRows: ReturnType<typeof rowsForPurpose>,
  isNormalizedSeries: boolean,
) {
  const v3Config = input.runConfig;
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of input.strategy.signalSources) {
    const binding = v3Config.priceInputBindings?.signals.find(
      (alias) => alias.sourceId === source.id,
    );
    const actualReference = binding?.binding === 'actual-price-series';
    const priceKey = signalPriceArtifactKeyV3(input.strategy, source.id, v3Config);
    const ref = binding
      ? input.artifacts.find((artifact) => artifact.key.endsWith(`/${priceKey}`))
      : signalArtifactFor(input.artifacts, source.asset.market, source.asset.symbol);
    if (ref) {
      const sourceCalendar = tradingCalendarFromFact(
        calendarFact(rowFor(calendarRows, (row) => row.market === source.asset.market)),
      );
      let rows = rowsAtTimeframe(
        input.rows.get(ref.key) ?? [],
        source.timeframe,
        sourceCalendar,
        v3Config.priceResearch?.dailyObservationContract !== undefined,
      ).filter((row) => lifecycleWarmupRowV3(v3Config, row));
      if (actualReference && !priceKey.startsWith('signal/')) {
        const key = (row: Readonly<Record<string, unknown>>) =>
          source.timeframe === '1d'
            ? Date.parse(String(row.occurredAt))
            : Date.parse(intradayBarSessionWindow(row, sourceCalendar).closedAt);
        const byTime = new Map(rows.map((row) => [key(row), row]));
        rows = rowsAtTimeframe(barRows, source.timeframe, sourceCalendar,
          v3Config.priceResearch?.dailyObservationContract !== undefined).map(
          (row) =>
            byTime.get(key(row)) ?? {
              ...row,
              open: null,
              high: null,
              low: null,
              close: null,
              volume: null,
              amount: null,
            },
        );
      }
      for (const field of source.series) {
        sourceSeries.set(sourceSeriesKey(source.id, field), {
          sourceId: source.id,
          symbol: source.asset.symbol,
          market: source.asset.market,
          assetType: source.asset.assetType,
          field,
          timeframe: source.timeframe,
          adjusted: isNormalizedSeries && !actualReference,
          points: rows.flatMap<BacktestSeries['points'][number]>((row) => {
            if (typeof row.occurredAt !== 'string' || typeof row.availableAt !== 'string')
              return [];
            const value = row[field];
            const interval =
              source.timeframe === '1d' ? undefined : intradayBarSessionWindow(row, sourceCalendar);
            const occurredAt = interval?.closedAt ?? row.occurredAt;
            if (typeof value !== 'string') {
              if (!actualReference && v3Config.priceResearch?.dailyObservationContract === undefined) return [];
              return [
                {
                  occurredAt,
                  availableAt: row.availableAt,
                  ...barResearchClocksV3(row, sourceCalendar, v3Config),
                  status: 'unavailable',
                  reason: field === 'volume' ? '该观测成交量未知' : '该会话缺少不复权参考价格',
                },
              ];
            }
            return [
              {
                occurredAt,
                availableAt: row.availableAt,
                ...(interval ?? {}),
                ...(typeof row.volume === 'string' ? { volume: row.volume } : {}),
                ...barResearchClocksV3(row, sourceCalendar, v3Config),
                value,
                status: 'available' as const,
              },
            ];
          }),
        });
      }
    }
  }

  return sourceSeries;
}
