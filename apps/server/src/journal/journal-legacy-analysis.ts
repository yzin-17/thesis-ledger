import { Injectable } from '@nestjs/common';
import {
  behaviorMetrics,
  counterfactualReplay,
  plannedVsActual,
  plannedVsActualStop,
  reviewWindow,
  type CompletedTrade,
  type RiskTriggerFact,
} from '@thesis-ledger/domain';

/** 仅供旧 number JSON 调试，不创建正式候选或复盘快照。 */
@Injectable()
export class JournalLegacyAnalysis {
  plannedVsActual(input: CompletedTrade) {
    return plannedVsActual(input);
  }

  plannedStopReview(fact: RiskTriggerFact, actualPnl?: number) {
    return plannedVsActualStop(fact, actualPnl);
  }

  counterfactual(input: { trades: CompletedTrade[]; enforceStop: boolean; stopPrice?: number }) {
    return counterfactualReplay(input);
  }

  review(input: { trades: CompletedTrade[]; start: string; end: string }) {
    return reviewWindow(input);
  }

  behavior(input: { trades: CompletedTrade[] }) {
    return behaviorMetrics(input.trades);
  }
}
