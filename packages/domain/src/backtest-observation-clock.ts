/** Explicit simulated visibility of an immutable provider observation. */
export interface BacktestResearchClock {
  basis: 'fixed-provider-snapshot';
  dataAsOf: string;
  decisionAt: string;
}

export interface BacktestAvailability {
  /** Actual observation availability; never replaced with the research clock. */
  availableAt: string;
  researchClock?: BacktestResearchClock;
}

export const availabilityForDecision = (fact: BacktestAvailability): string | undefined => {
  const observed = Date.parse(fact.availableAt);
  if (!Number.isFinite(observed)) return undefined;
  const clock = fact.researchClock;
  if (!clock) return fact.availableAt;
  const cutoff = Date.parse(clock.dataAsOf);
  const decision = Date.parse(clock.decisionAt);
  if (
    clock.basis !== 'fixed-provider-snapshot' ||
    !Number.isFinite(cutoff) ||
    !Number.isFinite(decision) ||
    observed > cutoff ||
    decision > cutoff
  ) {
    return undefined;
  }
  return clock.decisionAt;
};

export const isAvailableForDecisionAt = (
  fact: BacktestAvailability,
  evaluationAt: string,
): boolean => {
  const decisionAt = availabilityForDecision(fact);
  return decisionAt !== undefined && Date.parse(decisionAt) <= Date.parse(evaluationAt);
};

/** Combines both clocks; an ordinary fact retains its actual visibility constraint. */
export const mergeBacktestAvailability = (
  inputs: readonly BacktestAvailability[],
): BacktestAvailability => {
  if (inputs.length === 0) throw new Error('合并可见性至少需要一个输入');
  const latest = (values: readonly string[]) =>
    values.reduce((left, right) => (Date.parse(left) >= Date.parse(right) ? left : right));
  const availableAt = latest(inputs.map((input) => input.availableAt));
  const clocks = inputs.flatMap((input) => (input.researchClock ? [input.researchClock] : []));
  const clock = clocks[0];
  if (!clock) return { availableAt };
  if (clocks.some((other) => Date.parse(other.dataAsOf) !== Date.parse(clock.dataAsOf))) {
    throw new Error('固定快照研究输入的 dataAsOf 不一致');
  }
  return {
    availableAt,
    researchClock: {
      ...clock,
      decisionAt: latest(
        inputs.map((input) => availabilityForDecision(input) ?? input.availableAt),
      ),
    },
  };
};
