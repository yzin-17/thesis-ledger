import {
  buildResearchDataScope, researchStrategyScopeIssues, researchJointWindowIssues,
  tradingCalendarFromFact, type BacktestSeries, type ResearchScopeSourceInput,
  type BacktestStrategy as DomainStrategy,
} from '@thesis-ledger/domain';
import { backtestResearchDataScopeSchema, priceResearchReferenceArtifactKey,
  type BacktestStrategy, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { calendarFact, rowsAtTimeframe } from './backtest-v2-execution-shared.js';
import { signalPriceArtifactKeyV3 } from './backtest-signal-price-plan-v3.js';
import type { BacktestDependencyPlan } from './backtest-dependency-plan.js';
import { acquisitionCalendarPlan } from './backtest-settlement-calendar.js';

type ScopeInput = { strategy: BacktestStrategy; runConfig: RunConfigV3;
  rows: ReadonlyMap<string, readonly ArtifactRow[]>;
  calendarRows?: readonly ArtifactRow[] | undefined;
  actualVolumeBasis?: ResearchScopeSourceInput['volumeBasis'] | undefined;
  unavailableCapabilities?: { capability: string; code: string; message?: string | undefined }[];
};

export type ResearchCalendarReader = (strategy: BacktestStrategy, config: RunConfigV3,
  plan?: BacktestDependencyPlan) => Promise<readonly ArtifactRow[]>;

/** 已获取各周期先按同窗日历聚合，再生成能力；不补行情或改变分析日期。 */
export async function prepareAcquiredResearchDataScopeV3(input: Omit<ScopeInput, 'calendarRows'> & {
  calendar?: ResearchCalendarReader | undefined; plan: BacktestDependencyPlan; acquisitionStart: string;
}) {
  const aggregated = [input.strategy.primaryTimeframe, ...input.strategy.signalSources.map((source) => source.timeframe)]
    .some((timeframe) => timeframe !== '1d' && timeframe !== '1m');
  const calendarRows = aggregated ? await input.calendar?.(input.strategy, input.runConfig,
    acquisitionCalendarPlan(input.plan, input.acquisitionStart)) : undefined;
  return prepareResearchDataScopeV3({ ...input, calendarRows });
}

/** 只读取调用方已取得或冻结的产物；聚合复用正式交易日历及分钟构建器。 */
export function researchScopeInputsV3(input: ScopeInput): ResearchScopeSourceInput[] {
  const { strategy, runConfig } = input;
  const requests = [{ key: 'execution/bars.parquet', coordinate: 'research' as const,
    timeframe: strategy.primaryTimeframe },
  ...strategy.signalSources.filter((source) => runConfig.priceInputBindings?.signals.some((item) => item.sourceId === source.id))
    .map((source) => ({ key: signalPriceArtifactKeyV3(strategy, source.id, runConfig),
      coordinate: source.priceCoordinate === 'actual' ? 'actual' as const : 'research' as const,
      timeframe: source.timeframe })),
  ...(input.rows.has(priceResearchReferenceArtifactKey) ? [{ key: priceResearchReferenceArtifactKey,
    coordinate: 'actual' as const, timeframe: strategy.primaryTimeframe }] : [])];
  const unique = new Map(requests.map((request) => [JSON.stringify([request.coordinate, request.timeframe]), request]));
  return [...unique.values()].flatMap((request) => {
    const raw = input.rows.get(request.key);
    if (!raw?.length) return [];
    let rows: readonly Readonly<Record<string, unknown>>[] = raw;
    if (request.timeframe !== '1d' && request.timeframe !== '1m') {
      const fact = input.calendarRows?.find((row) => row.market === strategy.executionInstrument.market);
      if (!fact) throw new Error('逻辑周期能力统计缺少正式交易日历');
      rows = rowsAtTimeframe(raw, request.timeframe, tradingCalendarFromFact(calendarFact(fact)),
        runConfig.priceResearch?.dailyObservationContract !== undefined);
    }
    const sourceId = `$data-${request.coordinate}-${request.timeframe}`;
    const series: BacktestSeries[] = (['open', 'high', 'low', 'close', 'volume'] as const).map((field) => ({
      sourceId, ...strategy.executionInstrument, timeframe: request.timeframe, field,
      adjusted: request.coordinate === 'research',
      points: rows.map((row) => ({ occurredAt: String(row.occurredAt), availableAt: String(row.availableAt),
        ...(typeof row[field] === 'string' ? { status: 'available' as const, value: row[field] } :
          { status: 'unavailable' as const, reason: `字段 ${field} 未知` }) })),
    }));
    return [{ sourceId, coordinate: request.coordinate, timeframe: request.timeframe,
      analysisStartAt: `${runConfig.startDate}T00:00:00.000Z`, series,
      volumeBasis: request.coordinate === 'actual' ? input.actualVolumeBasis ?? 'unknown' :
        runConfig.executionPriceProtocol.priceBasis.volumeBasis }];
  });
}

export function prepareResearchDataScopeV3(input: ScopeInput) {
  const sources = researchScopeInputsV3(input);
  const scope = backtestResearchDataScopeSchema.parse(buildResearchDataScope({
    executionInstrument: input.strategy.executionInstrument, primaryTimeframe: input.strategy.primaryTimeframe, sources,
    unavailableCapabilities: input.unavailableCapabilities ?? input.runConfig.priceResearch?.dataScope?.unavailableCapabilities ?? [],
  }));
  const plan = researchStrategyScopeIssues(input.strategy as DomainStrategy, scope);
  const issues: { code: string; path: readonly (string | number)[]; message: string }[] =
    [...plan.issues];
  if (!issues.length) issues.push(...researchJointWindowIssues(plan.needs, sources,
    sources.find((source) => source.coordinate === 'research' && source.timeframe === input.strategy.primaryTimeframe)
      ?.series.find((series) => series.field === 'close')?.points.map((point) => point.occurredAt) ?? [],
    `${input.runConfig.startDate}T00:00:00.000Z`));
  return { scope, issues };
}

/** 有范围的新合同才启用；旧Run仍按原冻结合同重放。 */
export function assertResearchDataScopeV3(input: ScopeInput) {
  const scope = input.runConfig.priceResearch?.dataScope;
  if (!scope) return;
  const scopeIssues = researchStrategyScopeIssues(input.strategy as DomainStrategy, scope).issues;
  const actual = prepareResearchDataScopeV3(input);
  const issue = [...scopeIssues, ...actual.issues][0];
  if (issue) throw Object.assign(new Error(`${issue.path.join('.')}: ${issue.message}`),
    { code: 'RESEARCH_DATA_SCOPE_INVALID', diagnostics: [...scopeIssues, ...actual.issues] });
}

export function assertStrategyResearchScopeV3(strategy: BacktestStrategy, config: RunConfigV3) {
  if (!config.priceResearch?.dataScope) return;
  const issues = researchStrategyScopeIssues(strategy as DomainStrategy, config.priceResearch.dataScope).issues;
  if (issues.length) throw Object.assign(new Error(issues.map((issue) =>
    `${issue.path.join('.')}: ${issue.message}`).join('；')), { code: 'RESEARCH_DATA_SCOPE_INVALID', diagnostics: issues });
}
