import { DecimalValue as D } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { lossPausePlanConforms, lossPauseExecutionConforms } from './loss-pause-model.fixture.js';
import {
  volatilityPlanConforms,
  volatilityExecutionConforms,
} from './volatility-target.fixture.js';
import { monthlyPlanConforms, monthlyExecutionConforms } from './monthly-rebalance.fixture.js';
import {
  sessionVwapPlanConforms,
  sessionVwapExecutionConforms,
} from './session-vwap-model.fixture.js';
import { protectionPlanConforms, protectionExecutionConforms } from './protection-model.fixture.js';

const scenarioChecks = new Map([
  ...['frozen-atr', 'current-atr', 'unconditional-stop', 'armed-stop'].map(
    (id) => [id, { plan: protectionPlanConforms, execution: protectionExecutionConforms }] as const,
  ),
  ['session-vwap', { plan: sessionVwapPlanConforms, execution: sessionVwapExecutionConforms }],
  ['rolling-vwap', { plan: sessionVwapPlanConforms, execution: sessionVwapExecutionConforms }],
  ['month-end-rebalance', { plan: monthlyPlanConforms, execution: monthlyExecutionConforms }],
  ['initial-allocation', { plan: monthlyPlanConforms, execution: monthlyExecutionConforms }],
  ['daily-volatility', { plan: volatilityPlanConforms, execution: volatilityExecutionConforms }],
  ['fixed-allocation', { plan: volatilityPlanConforms, execution: volatilityExecutionConforms }],
  ['loss-window', { plan: lossPausePlanConforms, execution: lossPauseExecutionConforms }],
  ['bar-cooldown', { plan: lossPausePlanConforms, execution: lossPauseExecutionConforms }],
]);

export function modelPlanConforms(
  id: string,
  configuration: BacktestStrategy,
  confirmedCost?: BacktestStrategy['cost'],
) {
  if (
    confirmedCost &&
    ['frozen-atr', 'current-atr', 'unconditional-stop', 'armed-stop'].includes(id)
  )
    return protectionPlanConforms(id, configuration, confirmedCost);
  const checks = scenarioChecks.get(id);
  if (checks) return checks.plan(id, configuration);
  const plan = configuration.tradePlan;
  if (
    !plan ||
    !baseRulesConform(configuration) ||
    configuration.sizing.type !== 'percentOfEquity' ||
    D.from(configuration.sizing.percent).compareTo('0.2') !== 0
  )
    return false;
  const stop = plan.initialStop?.kind === 'percent' ? plan.initialStop.percent : undefined;
  if (!stop || D.from(stop).compareTo('0.05') !== 0 || plan.cooldown?.stopBars !== 10) return false;
  if (['fixed-stop', 'trailing-stop'].includes(id)) {
    return protectionConforms(id, plan);
  }
  if (plan.stages.length !== 2 || plan.trailing) return false;
  return stagesConform(id, plan.stages);
}

function protectionConforms(id: string, plan: NonNullable<BacktestStrategy['tradePlan']>) {
  if (plan.cooldown?.bars !== 10 || plan.stages.length) return false;
  if (id === 'fixed-stop') return !plan.trailing;
  return Boolean(
    plan.trailing &&
    'drawdownPercent' in plan.trailing &&
    D.from(plan.trailing.drawdownPercent).compareTo('0.05') === 0 &&
    D.from(plan.trailing.activationGainPercent ?? '0').compareTo('0.1') === 0,
  );
}

function stagesConform(id: string, stages: NonNullable<BacktestStrategy['tradePlan']>['stages']) {
  const basis = id === 'initial-half' ? 'initialQuantity' : 'remainingQuantity';
  return stages.every(
    (s, n) =>
      s.trigger.kind === 'gainPercent' &&
      D.from(s.trigger.value).compareTo(n === 0 ? '0.08' : '0.15') === 0 &&
      s.action.kind === 'reduce' &&
      s.action.basis === basis &&
      D.from(s.action.fraction).compareTo(n === 0 ? '0.25' : '0.5') === 0,
  );
}

function baseRulesConform(configuration: BacktestStrategy) {
  const entry = configuration.entry;
  return (
    !configuration.tradePlan?.riskBudget &&
    !configuration.tradePlan?.monthlyRebalance &&
    !configuration.tradePlan?.volatilityTarget &&
    !configuration.tradePlan?.lossPause &&
    entry.type === 'not' &&
    entry.expression.type === 'positionState' &&
    entry.expression.field === 'isOpen' &&
    isFalseExit(configuration.exit) &&
    configuration.risk.length === 0
  );
}

function isFalseExit(exit: BacktestStrategy['exit']) {
  return (
    exit.type === 'compare' &&
    exit.operator === 'eq' &&
    exit.left.type === 'constant' &&
    exit.right.type === 'constant' &&
    D.from(exit.left.value).compareTo(exit.right.value) !== 0
  );
}

export function modelExecutionConforms(
  id: string,
  fills: readonly { side: string; quantity: string; price: string; occurredAt: string }[],
  confirmedCost?: BacktestStrategy['cost'],
) {
  if (
    confirmedCost &&
    ['frozen-atr', 'current-atr', 'unconditional-stop', 'armed-stop'].includes(id)
  )
    return protectionExecutionConforms(id, fills, confirmedCost);
  const checks = scenarioChecks.get(id);
  if (checks) return checks.execution(id, fills);
  if (!fills.length || fills[0]!.side !== 'buy') return false;
  if (id === 'fixed-stop' || id === 'trailing-stop') {
    const price = id === 'fixed-stop' ? '7.992' : '10.989';
    return (
      fills.length === 2 &&
      fills[1]!.side === 'sell' &&
      fills[1]!.quantity === fills[0]!.quantity &&
      fills[1]!.price === price
    );
  }
  if (fills.length !== 4 || fills.slice(1).some((f) => f.side !== 'sell')) return false;
  const initial = D.from(fills[0]!.quantity);
  const secondFraction = id === 'initial-half' ? '0.5' : '0.375';
  return (
    D.from(fills[1]!.quantity).compareTo(initial.times('0.25')) === 0 &&
    D.from(fills[2]!.quantity).compareTo(initial.times(secondFraction)) === 0 &&
    D.from(fills[3]!.quantity).compareTo(
      initial.minus(fills[1]!.quantity).minus(fills[2]!.quantity),
    ) === 0
  );
}
