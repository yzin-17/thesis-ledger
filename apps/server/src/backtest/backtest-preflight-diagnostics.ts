import {
  backtestPreflightDiagnosticV3Schema,
  type BacktestPreflightDiagnosticV3,
  type BacktestPreflightRequirementV3,
  type BacktestPreflightTargetSourceV3,
} from '@thesis-ledger/schemas';
import type { BacktestDependencyPlanIssue } from './backtest-dependency-plan.js';

export interface BacktestPreflightDiagnosticContext {
  requirement: BacktestPreflightRequirementV3;
  /** An empty array explicitly means that the exact source target is unknown. */
  targetSources: readonly BacktestPreflightTargetSourceV3[];
  /** Supply details from the dependency plan; do not infer them from prose. */
  missingFields: readonly string[];
  incompatibleRules: readonly string[];
}

type IssueDiagnosticMapping = Pick<
  BacktestPreflightDiagnosticV3,
  'category' | 'code' | 'message' | 'suggestedActions'
>;

const issueMappings = {
  INVALID_WARMUP_RANGE: {
    category: 'input-invalid',
    code: 'INVALID_PARAMETER',
    message: '策略预热窗口无法表示为有效日期。',
    suggestedActions: [
      { action: 'correct-input', description: '调整回测起始日期或预热要求后重新预检。' },
    ],
  },
  EVENT_COVERAGE_UNAVAILABLE: {
    category: 'insufficient-coverage',
    code: 'DATA_UNAVAILABLE',
    message: '所需公司行动覆盖证据不可用。',
    suggestedActions: [
      { action: 'repair-data-coverage', description: '补齐所需用途的公司行动覆盖证据后重新预检。' },
    ],
  },
  EVENT_COVERAGE_INCOMPLETE: {
    category: 'insufficient-coverage',
    code: 'DATA_UNAVAILABLE',
    message: '公司行动覆盖未完整覆盖所需区间。',
    suggestedActions: [
      {
        action: 'repair-data-coverage',
        description: '将公司行动覆盖扩展到完整所需区间后重新预检。',
      },
    ],
  },
  EVENT_EFFECTIVE_DATE_MISSING: {
    category: 'data-unavailable',
    code: 'DATA_UNAVAILABLE',
    message: '公司行动事实缺少生效日期，无法判断是否影响本次窗口。',
    suggestedActions: [
      { action: 'repair-data-coverage', description: '补齐事实的生效日期并重新验证影响窗口。' },
    ],
  },
  EVENT_STRATEGY_VISIBILITY_MISSING: {
    category: 'point-in-time-unavailable',
    code: 'DATA_UNAVAILABLE',
    message: '事件信号缺少策略可见时间证据。',
    suggestedActions: [
      {
        action: 'provide-point-in-time-evidence',
        description: '提供严格的策略可见时间证据；不得以抓取时间代替。',
      },
    ],
  },
  EVENT_FACT_AFTER_DATA_AS_OF: {
    category: 'point-in-time-unavailable',
    code: 'FUTURE_DATA',
    message: '事件事实的可用时间晚于本次历史数据截止时点。',
    suggestedActions: [
      {
        action: 'provide-point-in-time-evidence',
        description: '提供截止时点内可用的可靠事实版本，或调整历史数据截止时点。',
      },
    ],
  },
  EXECUTION_PRICE_COORDINATE_MISMATCH: {
    category: 'incompatible-price-basis',
    code: 'DATA_UNAVAILABLE',
    message: '执行价格坐标与冻结的价格协议或市场币种不一致。',
    suggestedActions: [
      {
        action: 'select-compatible-route',
        description: '选择与冻结价格协议和市场币种一致的执行来源后重新预检。',
      },
    ],
  },
  RULE_INCOMPATIBLE: {
    category: 'rule-incompatible',
    code: 'RULE_REJECTED',
    message: '策略规则与冻结的价格、记账或真实单位事实不兼容。',
    suggestedActions: [
      {
        action: 'review-strategy-rules',
        description: '调整不兼容规则，或补齐可验证的单位转换证据后重新预检。',
      },
    ],
  },
} satisfies Record<BacktestDependencyPlanIssue['code'], IssueDiagnosticMapping>;

const contextUnavailableDiagnostic = (): BacktestPreflightDiagnosticV3 =>
  backtestPreflightDiagnosticV3Schema.parse({
    severity: 'error',
    category: 'input-invalid',
    code: 'INVALID_PARAMETER',
    message: '依赖规划问题缺少显式预检上下文，已拒绝生成推测性诊断。',
    symbol: null,
    capability: null,
    purpose: null,
    dateRange: null,
    routeKey: null,
    missingFields: ['preflightRequirementContext'],
    incompatibleRules: [],
    targetSources: [],
    suggestedActions: [
      {
        action: 'correct-input',
        description: '补齐标的、能力、用途、区间和来源目标上下文后重新生成预检诊断。',
      },
    ],
  });

/** Maps one pure dependency-planner issue into the strict public preflight diagnostic contract. */
export const mapBacktestDependencyIssueToPreflightDiagnosticV3 = (
  issue: BacktestDependencyPlanIssue,
  context?: BacktestPreflightDiagnosticContext,
): BacktestPreflightDiagnosticV3 => {
  if (!context) return contextUnavailableDiagnostic();

  const mapping = issueMappings[issue.code];
  const targetSources = [...context.targetSources];
  const targetNote = targetSources.length === 0 ? ' 精确来源目标未知，未推断供应商或上游。' : '';

  return backtestPreflightDiagnosticV3Schema.parse({
    severity: 'error',
    ...mapping,
    message: `${mapping.message}${targetNote}`,
    symbol: context.requirement.symbol,
    capability: context.requirement.capability,
    purpose: context.requirement.purpose,
    dateRange: context.requirement.dateRange,
    routeKey: context.requirement.routeKey,
    missingFields: [...context.missingFields],
    incompatibleRules: [...context.incompatibleRules],
    targetSources,
  });
};
