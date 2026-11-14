import {
  DecimalValue,
  tradingCalendarFromFact,
  type SimulationFillRecord,
} from '@thesis-ledger/domain';
import {
  priceResearchReferenceArtifactKey,
  type BacktestStrategy,
  type RunConfigV3,
  type BacktestResultV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { calendarFact } from './backtest-v2-execution-shared.js';
import { dailyBarSessionTimes } from './backtest-daily-bar-session.js';

export function priceResearchInputWarnings(
  runId: string,
  strategy: BacktestStrategy,
  config: RunConfigV3,
  rows: ReadonlyMap<string, readonly ArtifactRow[]>,
): string[] {
  if (!config.priceResearch || !config.priceResearch.actualPriceWindow) return [];
  const actual = new Set(
    (rows.get(`${runId}/${priceResearchReferenceArtifactKey}`) ?? []).map((row) => row.occurredAt),
  );
  const missing = (rows.get(`${runId}/execution/bars.parquet`) ?? []).filter(
    (row) => !actual.has(row.occurredAt),
  ).length;
  if (!missing) return [];
  const usage = strategy.signalSources.some((source) => source.priceCoordinate === 'actual')
    ? '对应价格条件不可评估；依赖这些日期的指标也可能不可用。'
    : '';
  return [
    `原价参考缺少 ${missing} 个研究交易日（含预热）；${usage}操作时点缺原价时，参考份数投入不执行。`,
  ];
}

export function priceResearchFills(
  runId: string,
  strategy: BacktestStrategy,
  config: RunConfigV3,
  byKey: ReadonlyMap<string, readonly ArtifactRow[]>,
  fills: readonly SimulationFillRecord[],
): BacktestResultV3['simulationFills'] {
  const project = (fill: SimulationFillRecord) => ({ ...fill, charges: [...fill.charges] });
  if (!config.priceResearch) return fills.map(project);
  const raw = byKey.get(`${runId}/${priceResearchReferenceArtifactKey}`) ?? [];
  if (!raw.length) return fills.map(project);
  const calendarRows = byKey.get(
    `${runId}/calendar/${strategy.executionInstrument.market}.parquet`,
  );
  if (!calendarRows?.[0]) throw new Error('价格研究结果缺少冻结交易日历');
  const calendar = tradingCalendarFromFact(calendarFact(calendarRows[0]));
  const byOpen = new Map(
    raw.map((row) => [Date.parse(dailyBarSessionTimes(row, calendar).openedAt ?? ''), row]),
  );
  return fills.map((fill) => {
    const row = byOpen.get(Date.parse(fill.occurredAt));
    if (typeof row?.open !== 'string') return project(fill);
    const result: BacktestResultV3['simulationFills'][number] = {
      ...project(fill),
      actualReferencePrice: row.open,
    };
    if (fill.side === 'buy' && strategy.sizing.type === 'fixedQuantity') {
      result.researchSizing = {
        actualPrice: row.open,
        referenceQuantity: strategy.sizing.quantity,
        requestedNotional: DecimalValue.from(row.open).times(strategy.sizing.quantity).toString(),
      };
    }
    return result;
  });
}
