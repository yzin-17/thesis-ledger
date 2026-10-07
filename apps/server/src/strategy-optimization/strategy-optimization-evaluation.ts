import { DecimalValue } from '@thesis-ledger/domain';
import { backtestResultSchemaV3, type BacktestResultV3 } from '@thesis-ledger/schemas';
import { toRecord, type EvaluationSummary } from './strategy-optimization-common.js';

const metricValue = (result: BacktestResultV3, aliases: string[]) => {
  for (const key of aliases) {
    const item = result.metrics[key];
    if (item?.status === 'available' && item.value !== undefined) return item.value;
  }
  return undefined;
};

const executionDiagnostics = (result: BacktestResultV3) => {
  const rejected = [...result.rejectedOrders, ...(result.rejectedNavRequests ?? [])];
  const rejectionReasons = rejected.reduce<Record<string, number>>((counts, item) => {
    counts[item.reasonCode] = (counts[item.reasonCode] ?? 0) + 1;
    return counts;
  }, {});
  return {
    fillCount: result.simulationFills.length,
    rejectedOrderCount: rejected.length,
    ...(Object.keys(rejectionReasons).length > 0 ? { rejectionReasons } : {}),
  };
};

const invalidSummary = (
  runId: string,
  result: BacktestResultV3,
  reason: string,
  failureCategory: NonNullable<EvaluationSummary['failureCategory']>,
): EvaluationSummary => ({
  runId,
  status: 'invalid',
  completeness: result.completeness,
  tradeCount: result.trades.length,
  ...executionDiagnostics(result),
  reason,
  failureCategory,
});

const drawdownMagnitude = (value: string) => {
  const parsed = DecimalValue.from(value);
  return parsed.isNegative() ? DecimalValue.from('0').minus(parsed) : parsed;
};

export const calculateOptimizationScore = (
  mode: unknown,
  totalReturn: string,
  maxDrawdown: string,
  turnover?: string,
) => {
  const returnNumber = Number(totalReturn);
  const drawdownNumber = Number(drawdownMagnitude(maxDrawdown).toString());
  const turnoverNumber = turnover ? Number(turnover) : 0;
  if (mode === 'return') return returnNumber;
  if (mode === 'drawdown') return -drawdownNumber;
  if (mode === 'lowTurnover') return -turnoverNumber;
  return returnNumber - drawdownNumber - turnoverNumber * 0.05;
};

export function evaluateOptimizationResult(
  run: { id: string; result: unknown },
  objectiveValue: unknown,
): EvaluationSummary {
  const result = backtestResultSchemaV3.parse(run.result);
  if (result.completeness !== 'complete')
    return invalidSummary(run.id, result, '回测数据完整性不是 complete', 'data-unavailable');
  const objective = toRecord(objectiveValue);
  const minimumTrades =
    typeof objective.minClosedTrades === 'number' ? objective.minClosedTrades : 1;
  if (result.trades.length < minimumTrades)
    return invalidSummary(run.id, result, `闭合交易少于 ${minimumTrades}`, 'strategy-ineligible');
  const totalReturn = metricValue(result, ['totalReturn', 'cumulativeReturn', 'return']);
  const maxDrawdown = metricValue(result, ['maxDrawdown', 'drawdown']);
  if (!totalReturn || !maxDrawdown)
    return invalidSummary(run.id, result, '关键收益/回撤指标不可用', 'data-unavailable');
  const turnover = metricValue(result, ['turnover', 'turnoverRate']);
  if (
    (objective.mode === 'lowTurnover' || objective.mode === 'balanced') &&
    turnover === undefined
  ) {
    return invalidSummary(
      run.id,
      result,
      '当前优化目标需要可用换手率，不能按零换手率评分',
      'data-unavailable',
    );
  }
  const maxAllowed = typeof objective.maxDrawdown === 'string' ? objective.maxDrawdown : undefined;
  if (maxAllowed && drawdownMagnitude(maxDrawdown).compareTo(maxAllowed) > 0)
    return {
      ...invalidSummary(run.id, result, '最大回撤超过硬约束', 'strategy-performance'),
      totalReturn,
      maxDrawdown,
      ...(turnover ? { turnover } : {}),
    };
  const score = calculateOptimizationScore(objective.mode, totalReturn, maxDrawdown, turnover);
  if (!Number.isFinite(score))
    return invalidSummary(run.id, result, '优化评分超出可表示范围', 'data-unavailable');
  return {
    runId: run.id,
    status: 'valid',
    completeness: result.completeness,
    tradeCount: result.trades.length,
    ...executionDiagnostics(result),
    totalReturn,
    maxDrawdown,
    ...(turnover ? { turnover } : {}),
    score,
  };
}
