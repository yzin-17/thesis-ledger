import {
  compareMarketPitEvidenceInstantStringsV1,
  type BacktestNavSourceResponseV3,
} from '@thesis-ledger/schemas';
import type { NavSnapshotInputPlanV3 } from './backtest-nav-input-plan.js';
import type { NavFrozenContext } from './backtest-nav-freeze-validation.js';
import { navPlanUnavailable } from './backtest-nav-planning-calendar.js';
import { validateNavResearchFact, validateNavResearchRule } from './backtest-nav-visibility.js';
import { validateNavSourceRecords } from './backtest-nav-source-evidence.js';

export function assertNavPreparationInstant(left: string, right: string) {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  if (order === undefined || order > 0) navPlanUnavailable('NAV 证据晚于实际冻结时点或时钟无效');
}

export function validateNavPreparationProof(
  response: BacktestNavSourceResponseV3,
  context: NavFrozenContext,
  plan: NavSnapshotInputPlanV3,
) {
  const freezeAt = context.runConfig.dataAsOf;
  assertNavPreparationInstant(response.source.capturedAt, freezeAt);
  assertNavPreparationInstant(response.admission.recordedAt, freezeAt);
  assertNavPreparationInstant(response.admission.validFrom, freezeAt);
  const expiry = compareMarketPitEvidenceInstantStringsV1(freezeAt, response.admission.validUntil);
  if (expiry === undefined || expiry >= 0) navPlanUnavailable('NAV 准入在冻结时点已经失效');
  const actualDates = response.facts.map((fact) => fact.valuationDate);
  if (JSON.stringify(actualDates) !== JSON.stringify(plan.expectedValuationDates)) {
    navPlanUnavailable('NAV 完整输入计划与实际净值覆盖不一致');
  }
  if (
    response.coverage.startDate !== plan.navRange.startDate ||
    response.coverage.endDate !== plan.navRange.endDate
  ) {
    navPlanUnavailable('NAV 来源范围与完整预热及运行范围不一致');
  }
  validateNavResearchRule(context);
  validateNavSourceRecords({ facts: response.facts }, context);
  for (const fact of response.facts) {
    assertNavPreparationInstant(fact.occurredAt, response.source.capturedAt);
    assertNavPreparationInstant(fact.occurredAt, fact.availableAt);
    assertNavPreparationInstant(fact.availableAt, freezeAt);
    validateNavResearchFact(fact, context);
  }
}
