import type { BacktestCorporateActionFact } from './backtest-corporate-actions.js';
import type { BooleanEvaluation, SimulationExpressionContext } from './backtest-simulation.js';

/** 事件日信号使用独立可见性；研究价格时钟不会改变事件的 PIT。 */
export function evaluateCorporateActionSignal(
  eventType: string, context: SimulationExpressionContext,
): BooleanEvaluation {
  const occurredAt = context.tick.occurredAt;
  const unavailable = (reason: string): BooleanEvaluation => ({ status: 'unavailable', occurredAt, reason });
  const input = context.corporateActionSignals;
  const date = context.tick.tradingDate;
  if (!input || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return unavailable('corporateActionEvent 缺少 effectiveDate/strategyVisibility 已核验输入或交易日期');
  }
  const facts = input.facts.filter((fact) => fact.symbol === input.symbol
    && fact.market === input.market && fact.type === eventType);
  if (facts.some((fact) => !fact.effectiveDate)) return unavailable('公司行动缺少明确 effectiveDate');
  const matching = facts.filter((fact) => fact.effectiveDate === date);
  let availableAt = occurredAt;
  for (const fact of matching) {
    if (!visibleAt(fact, occurredAt, date)) return unavailable('公司行动缺少策略可见性或尚未可见');
    if (Date.parse(fact.availableAt) > Date.parse(availableAt)) availableAt = fact.availableAt;
  }
  return { status: 'available', value: matching.length > 0, occurredAt, availableAt };
}

function visibleAt(fact: BacktestCorporateActionFact, occurredAt: string, tradingDate: string): boolean {
  const now = Date.parse(occurredAt);
  const available = Date.parse(fact.availableAt);
  if (!Number.isFinite(now) || !Number.isFinite(available) || available > now) return false;
  const visibility = fact.strategyVisibility;
  if (!visibility) return false;
  if (visibility.kind === 'conservative-day') return visibility.visibleDate < tradingDate;
  const announced = Date.parse(visibility.announcedAt);
  return Number.isFinite(announced) && announced <= now;
}
