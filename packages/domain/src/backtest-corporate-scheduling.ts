import { availabilityForDecision } from './backtest-observation-clock.js';
import {
  corporateActionAccountingAt,
  corporateActionEventId,
  type BacktestCorporateActionFact,
} from './backtest-corporate-actions.js';
import type { SimulationSettlement } from './simulation-ledger.js';
import type { createSimulationEvent, SimulationEvent } from './backtest-simulation.js';

export function scheduledCorporateActions(
  facts: readonly BacktestCorporateActionFact[],
  runId: string,
) {
  return [...facts]
    .sort((left, right) =>
      corporateActionEventId(left, runId).localeCompare(corporateActionEventId(right, runId)),
    )
    .map((fact) => {
      const occurredAt = corporateActionAccountingAt(fact);
      const observed = availabilityForDecision(fact);
      if (!observed) throw new Error('公司行动研究时钟无效');
      return {
        fact,
        eventId: corporateActionEventId(fact, runId),
        occurredAt,
        availableAt: Date.parse(occurredAt) >= Date.parse(observed) ? occurredAt : observed,
      };
    });
}

export function corporateActionCashSettlement(
  fact: BacktestCorporateActionFact,
  sourceEventId: string,
): SimulationSettlement | undefined {
  if (!fact.cashSettlementAt) return undefined;
  if (
    fact.type !== 'CASH_DIVIDEND' ||
    !fact.currency ||
    !fact.researchClock ||
    Date.parse(fact.cashSettlementAt) < Date.parse(corporateActionAccountingAt(fact))
  )
    throw new Error('现金分红结算调度无效');
  return {
    eventId: `${sourceEventId}:payment`,
    sourceEventId,
    kind: 'cash',
    currency: fact.currency,
    occurredAt: fact.cashSettlementAt,
    availableAt: fact.cashSettlementAt,
  };
}

/** 公司行动来源固定结算金额；事件工厂由编排器提供，避免运行时反向依赖。 */
export function enqueueCorporateActionPayment(
  fact: BacktestCorporateActionFact,
  sourceEventId: string,
  state: {
    input: { runId: string };
    sequence: number;
    queue: { enqueue: (event: SimulationEvent) => void };
  },
  createEvent: typeof createSimulationEvent,
): void {
  const settlement = corporateActionCashSettlement(fact, sourceEventId);
  if (!settlement) return;
  const payment = createEvent({
    runId: state.input.runId,
    sequence: state.sequence++,
    type: 'cashSettlement',
    phase: 'SessionSettlementState',
    occurredAt: settlement.occurredAt,
    availableAt: settlement.availableAt,
    payload: settlement as unknown as Record<string, unknown>,
  });
  state.queue.enqueue({ ...payment, eventId: settlement.eventId });
}
