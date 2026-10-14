import type { ExecutionRuleFacts, ExecutionRuleRejectCode } from './execution-rules.js';

/** 研究截点只决定来源能否读取；交易日仍以真实 evaluatedAt 评估。 */
export function executionRuleAvailability(
  facts: ExecutionRuleFacts,
  evaluatedAt: string,
): { code: ExecutionRuleRejectCode; reason: string } | undefined {
  const decision = Date.parse(evaluatedAt);
  const instrument = Date.parse(facts.instrument.availableAt);
  const calendar = Date.parse(facts.calendarAvailableAt);
  if (!Number.isFinite(decision) || !Number.isFinite(instrument))
    return { code: 'INSTRUMENT_NOT_TRADABLE', reason: '评估时间或 Instrument Fact 时间无效' };
  if (!Number.isFinite(calendar))
    return { code: 'CALENDAR_UNAVAILABLE', reason: 'Calendar Fact 时间无效' };
  let cutoff = decision;
  if (facts.factResearch) {
    cutoff = Date.parse(facts.factResearch.dataAsOf);
    if (
      facts.factResearch.basis !== 'fixed-provider-snapshot' ||
      !Number.isFinite(cutoff) ||
      cutoff < decision
    )
      return { code: 'CALENDAR_UNAVAILABLE', reason: '固定快照规则事实研究截点无效' };
  }
  if (calendar > cutoff)
    return { code: 'CALENDAR_UNAVAILABLE', reason: 'Calendar Fact 在评估时尚不可用' };
  if (instrument > cutoff)
    return { code: 'INSTRUMENT_NOT_TRADABLE', reason: 'Instrument Fact 在评估时尚不可用' };
  return undefined;
}
