import type { LedgerMutationResult } from './simulation-ledger.js';
import type {
  CnNavPricingEvent,
  CnNavRequestState,
  CnNavSimulationRejectCode,
} from './nav-simulation-contracts.js';
import { navTime } from './nav-simulation-rules.js';

export const ledgerRejectCode = (result: LedgerMutationResult): CnNavSimulationRejectCode => {
  if (result.applied) return 'RULE_REJECTED';
  if (result.code === 'INSUFFICIENT_CASH') return 'INSUFFICIENT_CASH';
  if (result.code === 'INSUFFICIENT_SETTLED_POSITION') return 'INSUFFICIENT_POSITION';
  if (result.code === 'FUTURE_DATA') return 'FUTURE_DATA';
  if (result.code === 'INVALID_TIME') return 'INVALID_TIME';
  if (result.code === 'CURRENCY_MISMATCH') return 'CURRENCY_MISMATCH';
  if (result.code === 'INSTRUMENT_MISMATCH') return 'INSTRUMENT_MISMATCH';
  if (result.code === 'SETTLEMENT_SOURCE_NOT_FOUND') return 'SETTLEMENT_SOURCE_NOT_FOUND';
  return 'RULE_REJECTED';
};

export const navFactRejectReason = (
  fact: CnNavPricingEvent['fact'],
  request: CnNavRequestState,
): { code: CnNavSimulationRejectCode; reason: string } | undefined => {
  if (
    fact.symbol !== request.executionSymbol ||
    fact.market !== 'CN' ||
    fact.instrumentType !== 'NAV_FUND' ||
    fact.valuationDate !== request.valuationDate
  ) {
    return { code: 'RULE_REJECTED', reason: 'NAV fact 身份或 valuationDate 与请求不一致' };
  }
  if (request.cutoffAt !== undefined && navTime(fact.occurredAt) < navTime(request.cutoffAt)) {
    return { code: 'RULE_REJECTED', reason: 'NAV occurredAt 不能早于 cutoff' };
  }
  if (fact.status !== 'supported' || fact.nav === null) {
    return { code: 'NAV_UNAVAILABLE', reason: fact.reason ?? 'NAV Fact 不可用' };
  }
  if (fact.freshness === 'stale' || fact.freshness === 'unknown' || fact.quality !== 'complete') {
    return { code: 'NAV_UNAVAILABLE', reason: 'NAV Fact freshness/quality 不满足运行要求' };
  }
  return undefined;
};

export const settlementRejectReason = (
  request: CnNavRequestState & { fillAvailableAt?: string },
  redemption: boolean,
) => {
  if (
    (redemption && request.requestType !== 'redeem') ||
    (!redemption && request.requestType !== 'subscribe')
  ) {
    return { code: 'RULE_REJECTED' as const, reason: '现金结算事件类型与请求不一致' };
  }
  if (!request.fillId || request.status === 'cancelled') {
    return {
      code:
        request.status === 'cancelled' ? ('REQUEST_CANCELLED' as const) : ('NAV_DELAYED' as const),
      reason: request.status === 'cancelled' ? 'NAV 请求已取消' : 'NAV 尚未确认',
    };
  }
  return undefined;
};
