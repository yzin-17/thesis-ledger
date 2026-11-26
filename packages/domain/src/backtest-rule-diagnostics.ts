import type { Expression } from './backtest-strategy.js';
import type { BacktestSeries } from './backtest-series.js';
import type { BooleanEvaluation, SimulationTick } from './backtest-simulation.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import { expressionSourceIds } from './backtest-expression-observations.js';
import { sourceExpressionLookback } from './backtest-expression-lookback.js';

export type RuleObservation = {
  ruleId: string;
  evaluation: BooleanEvaluation;
  applicable: boolean;
  tick: SimulationTick;
};
export type RuleEvaluationObserver = (observation: RuleObservation) => void;
type Reason = { code: string; reason: string; count: number;
  samples: { path: readonly (string | number)[]; occurredAt: string; message: string }[] };
export type RuleEvaluationDiagnostic = {
  ruleId: string; path: readonly (string | number)[];
  observations: number; computableObservations: number; trueObservations: number;
  applicableDecisions: number; computableDecisions: number; warmupObservations: number;
  unavailableReasons: Reason[];
};
export type RuleEvaluationDiagnostics = { version: 'rule-evaluation-v1'; rules: RuleEvaluationDiagnostic[] };

const countThrough = (times: readonly number[], at: number) => {
  let low = 0, high = times.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid]! <= at) low = mid + 1;
    else high = mid;
  }
  return low;
};

/** 每个根、每个原因只留三个样本；计算长窗时不积累逐根AST。 */
export class RuleDiagnosticsCollector {
  private readonly values = new Map<string, RuleEvaluationDiagnostic>();
  private readonly requirements = new Map<string, { sourceId: string; rows: number }[]>();
  private readonly times = new Map<string, number[]>();

  constructor(
    roots: readonly { expression: Expression; path: readonly (string | number)[] }[],
    sourceSeries: ReadonlyMap<string, BacktestSeries>,
  ) {
    for (const series of sourceSeries.values()) {
      if (!this.times.has(series.sourceId) || series.field === 'close')
        this.times.set(series.sourceId, series.points.map((point) => Date.parse(point.occurredAt)).sort((a, b) => a - b));
    }
    for (const root of roots) {
      const ruleId = root.path[0] === 'tradePlan' ? root.path.slice(0, 2).join('.') : String(root.path[0]);
      if (!['entry', 'exit', 'tradePlan.initialStop', 'tradePlan.trailing'].includes(ruleId)) continue;
      this.values.set(ruleId, this.empty(ruleId, root.path));
      this.requirements.set(ruleId, expressionSourceIds(root.expression).map((sourceId) => ({
        sourceId, rows: sourceExpressionLookback(root.expression, sourceId),
      })));
    }
  }

  private empty(ruleId: string, path: readonly (string | number)[]): RuleEvaluationDiagnostic {
    return { ruleId, path, observations: 0, computableObservations: 0, trueObservations: 0,
      applicableDecisions: 0, computableDecisions: 0, warmupObservations: 0, unavailableReasons: [] };
  }

  readonly observe: RuleEvaluationObserver = ({ ruleId, evaluation, applicable, tick }) => {
    const rule = this.values.get(ruleId) ?? this.empty(ruleId, [ruleId]);
    this.values.set(ruleId, rule);
    rule.observations++;
    if (applicable) rule.applicableDecisions++;
    if (evaluation.status === 'available' && isAvailableForDecisionAt(evaluation, tick.occurredAt)) {
      rule.computableObservations++;
      if (evaluation.value) rule.trueObservations++;
      if (applicable) rule.computableDecisions++;
      return;
    }
    if (!applicable) return;
    const warmup = this.requirements.get(ruleId)?.some(({ sourceId, rows }) => {
      const times = this.times.get(sourceId);
      return times !== undefined && countThrough(times, Date.parse(tick.occurredAt)) < rows;
    });
    if (warmup) rule.warmupObservations++;
    let code = 'RULE_INPUT_UNAVAILABLE';
    if (warmup) code = 'RULE_WARMUP';
    else if (evaluation.status === 'available') code = 'RULE_FACT_NOT_VISIBLE';
    const message = evaluation.status === 'unavailable' ? evaluation.reason : '规则所需事实尚未可见';
    this.recordReason(rule, code, message, tick.occurredAt);
  };

  private recordReason(rule: RuleEvaluationDiagnostic, code: string, message: string, at: string) {
    let reason = rule.unavailableReasons.find((item) => item.code === code && item.reason === message);
    if (!reason) {
      if (rule.unavailableReasons.length >= 12) {
        code = 'OTHER_UNAVAILABLE';
        reason = rule.unavailableReasons.find((item) => item.code === code);
      }
      if (!reason) {
        reason = { code, reason: code === 'OTHER_UNAVAILABLE' ? '其他不可用原因' : message, count: 0, samples: [] };
        rule.unavailableReasons.push(reason);
      }
    }
    reason.count++;
    if (reason.samples.length < 3) reason.samples.push({ path: rule.path, occurredAt: at, message });
  }

  snapshot(): RuleEvaluationDiagnostics {
    return { version: 'rule-evaluation-v1', rules: structuredClone([...this.values.values()]) };
  }
}
