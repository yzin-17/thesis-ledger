import { DecimalValue } from './decimal.js';
import type { BacktestSeries } from './backtest-series.js';
import type { BacktestAssetSymbolRef, BacktestSeriesField, BacktestTimeframe, BacktestStrategy } from './backtest-strategy.js';
import { researchStrategyInputNeeds, type ResearchCoordinate, type ResearchInputNeed } from './backtest-research-inputs.js';

export type ResearchFieldWindow = { field: BacktestSeriesField; validRows: number;
  warmupRows: number; longestWindowRows: number };
type VolumeBasis = 'original' | 'split-adjusted' | 'unknown';
export type ResearchDataScopeSource = { sourceId: string; coordinate: ResearchCoordinate;
  timeframe: BacktestTimeframe; fields: BacktestSeriesField[]; warmupRows: number;
  observedRows: number; fieldWindows: ResearchFieldWindow[]; volumeBasis: VolumeBasis };
export type ResearchDataScope = {
  executionInstrument: BacktestAssetSymbolRef;
  version: 1; priceCoordinates: ResearchCoordinate[]; sources: ResearchDataScopeSource[];
  sizingModes: ('fixedAmount' | 'equityRatio' | 'fixedQuantity')[];
  unavailableCapabilities: { capability: string; code: string; message?: string | undefined }[];
};

/** 输入必须已经按正式日历与周期构成逻辑序列；此处不做分钟倍数推算。 */
export type ResearchScopeSourceInput = {
  sourceId: string; coordinate: ResearchCoordinate; timeframe: BacktestTimeframe;
  series: readonly BacktestSeries[]; analysisStartAt: string; volumeBasis: VolumeBasis;
};

function summarizeSource(input: ResearchScopeSourceInput): ResearchDataScopeSource | undefined {
  const at = Date.parse(input.analysisStartAt);
  if (!Number.isFinite(at)) throw new Error('能力窗口的分析起点无效');
  const points = new Map<BacktestSeriesField, Map<number, boolean>>();
  const times = new Set<number>();
  for (const series of input.series) {
    if (series.sourceId !== input.sourceId || series.timeframe !== input.timeframe || points.has(series.field))
      throw new Error('能力窗口的逻辑来源、周期或字段重复／不一致');
    const values = new Map<number, boolean>();
    for (const point of series.points) {
      const time = Date.parse(point.occurredAt);
      if (!Number.isFinite(time) || values.has(time)) throw new Error('能力窗口的观测时点无效或重复');
      const valid = point.status !== 'unavailable' && point.value !== undefined;
      if (valid) {
        const value = DecimalValue.from(point.value!);
        if (value.isNegative() || (series.field !== 'volume' && !value.isPositive()))
          throw new Error(`能力窗口字段 ${series.field} 包含无效数值`);
      }
      values.set(time, valid);
      times.add(time);
    }
    points.set(series.field, values);
  }
  const ordered = [...times].sort((a, b) => a - b);
  const fieldWindows = [...points].map(([field, values]): ResearchFieldWindow => {
    let validRows = 0, warmupRows = 0, longestWindowRows = 0, run = 0;
    for (const time of ordered) {
      if (!values.get(time)) { run = 0; continue; }
      validRows++;
      if (time < at) warmupRows++;
      run++;
      longestWindowRows = Math.max(longestWindowRows, run);
    }
    return { field, validRows, warmupRows, longestWindowRows };
  }).sort((a, b) => a.field.localeCompare(b.field));
  const fields = fieldWindows.filter((field) => field.validRows > 0).map((field) => field.field);
  if (!fields.length) return;
  return { sourceId: input.sourceId, coordinate: input.coordinate, timeframe: input.timeframe,
    fields, observedRows: ordered.length, fieldWindows, volumeBasis: input.volumeBasis,
    warmupRows: Math.max(0, ...fieldWindows.map((field) => field.warmupRows)),
  };
}

export function buildResearchDataScope(input: {
  executionInstrument: BacktestAssetSymbolRef;
  primaryTimeframe: BacktestTimeframe;
  sources: readonly ResearchScopeSourceInput[];
  unavailableCapabilities?: ResearchDataScope['unavailableCapabilities'];
}): ResearchDataScope {
  for (const source of input.sources) for (const series of source.series) {
    const asset = input.executionInstrument;
    if (series.symbol !== asset.symbol || series.market !== asset.market || series.assetType !== asset.assetType)
      throw new Error('能力窗口不能包含范围外标的');
  }
  const sources = input.sources.map(summarizeSource).filter((source) => source !== undefined);
  const priceCoordinates = [...new Set(sources.filter((source) =>
    source.fields.some((field) => field !== 'volume')).map((source) => source.coordinate))].sort();
  const sizingModes: ResearchDataScope['sizingModes'] = ['fixedAmount', 'equityRatio'];
  if (sources.some((source) => source.coordinate === 'actual' && source.timeframe === input.primaryTimeframe &&
      source.fields.includes('open'))) sizingModes.push('fixedQuantity');
  return { executionInstrument: input.executionInstrument, version: 1, priceCoordinates, sources, sizingModes,
    unavailableCapabilities: [...(input.unavailableCapabilities ?? [])] };
}

/** 摘要是快速必要条件；组合窗口还须由同一冻结逻辑序列复核。 */
export function researchScopeIssues(needs: readonly ResearchInputNeed[], scope: ResearchDataScope) {
  const issues: { stage: 'data-scope'; code: string; path: readonly (string | number)[];
    message: string; details: Record<string, string | number> }[] = [];
  for (const need of needs) {
    if (need.necessity === 'optional') continue;
    const asset = scope.executionInstrument;
    const source = scope.sources.find((source) => source.coordinate === need.coordinate && source.timeframe === need.timeframe);
    let code: string | undefined;
    if (asset.symbol !== need.asset.symbol || asset.market !== need.asset.market || asset.assetType !== need.asset.assetType)
      code = 'DATA_SCOPE_ASSET';
    else if (!source) code = 'DATA_SCOPE_SOURCE';
    if (code) {
      issues.push({ stage: 'data-scope', code, path: need.consumers[0]?.path ?? [],
        message: `本次能力范围未准备 ${need.asset.symbol} 的${need.coordinate}／${need.timeframe}输入`,
        details: { sourceId: need.sourceId, coordinate: need.coordinate, timeframe: need.timeframe } });
      continue;
    }
    for (const consumer of need.consumers) for (const field of consumer.fields) {
      const window = source!.fieldWindows.find((window) => window.field === field);
      if (source!.fields.includes(field) && (window?.longestWindowRows ?? 0) >= consumer.minimumWarmupRows) continue;
      issues.push({ stage: 'data-scope', code: source!.fields.includes(field) ? 'DATA_SCOPE_WARMUP' : 'DATA_SCOPE_FIELD',
        path: consumer.path, message: `规则所需 ${need.coordinate}／${need.timeframe} 的 ${field} 窗口不足：需要${consumer.minimumWarmupRows}根连续输入，实际最多${window?.longestWindowRows ?? 0}根`,
        details: { sourceId: need.sourceId, coordinate: need.coordinate, timeframe: need.timeframe, field,
          requiredRows: consumer.minimumWarmupRows, availableRows: window?.longestWindowRows ?? 0 } });
    }
  }
  return issues;
}

export function researchStrategyScopeIssues(strategy: BacktestStrategy, scope: ResearchDataScope) {
  const plan = researchStrategyInputNeeds(strategy, { executionCoordinate: 'research' });
  const sizingMode = strategy.sizing.type === 'fixedQuantity' ? 'fixedQuantity' :
    strategy.sizing.type === 'fixedAmount' ? 'fixedAmount' : 'equityRatio';
  return { needs: plan.needs, issues: [...plan.issues, ...researchScopeIssues(plan.needs, scope),
    ...(scope.sizingModes.includes(sizingMode) ? [] : [{ code: 'DATA_SCOPE_SIZING', path: ['sizing'],
      message: `本次能力范围未开放 ${sizingMode} 投入方式` }])] };
}
