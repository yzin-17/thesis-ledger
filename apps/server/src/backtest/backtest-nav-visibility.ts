import type { BacktestNavRunConfigV3, BacktestNavSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { navPlanUnavailable, type NavPlanningCalendar } from './backtest-nav-planning-calendar.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import type { NavFrozenContext } from './backtest-nav-freeze-validation.js';
import { hashNavRaw, navIntegrityFailure } from './backtest-nav-source-evidence.js';

/** 从独立披露工作日历计数，T 不计入；日终后下一自然日零点才可见。 */
export const navResearchVisibility = (
  valuationDate: string,
  visibility: Extract<BacktestNavRunConfigV3['navVisibility'], { mode: 'research-assumption' }>,
  calendar: NavPlanningCalendar,
) => {
  const rule = visibility.rule;
  if (
    visibility.disclosureCalendarHash !== calendar.contentHash ||
    valuationDate < rule.applicableRange.startDate ||
    valuationDate > rule.applicableRange.endDate
  ) {
    navPlanUnavailable('NAV 研究规则未覆盖估值日或披露日历摘要不符');
  }
  const disclosureDate = calendar.disclosureWorkDates.filter((day) => day > valuationDate)[
    rule.delayWorkdays - 1
  ];
  if (!disclosureDate) navPlanUnavailable('NAV 披露工作日历未覆盖可见性尾部预算');
  const next = new Date(`${disclosureDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    disclosureDate,
    assumedAvailableAt: `${next.toISOString().slice(0, 10)}T00:00:00+08:00`,
  };
};

export const planNavVisibility = (
  config: BacktestNavRunConfigV3,
  calendar: NavPlanningCalendar,
  dates: readonly string[],
) => {
  if (config.navVisibility.mode === 'strict-publication') {
    return {
      mode: 'strict-publication' as const,
      disclosureTailWorkdays: 0,
      disclosureRange: null,
    };
  }
  const last = navResearchVisibility(dates[dates.length - 1]!, config.navVisibility, calendar);
  for (const day of dates) navResearchVisibility(day, config.navVisibility, calendar);
  return {
    mode: 'research-assumption' as const,
    disclosureTailWorkdays: config.navVisibility.rule.delayWorkdays,
    disclosureRange: { startDate: dates[0]!, endDate: last.disclosureDate },
  };
};

export const validateNavResearchRule = (context: NavFrozenContext): void => {
  const visibility = context.runConfig.navVisibility;
  if (visibility.mode === 'strict-publication') {
    if (context.ruleRaw !== null) navIntegrityFailure('严格模式不能携带研究规则原文');
    return;
  }
  const raw = context.ruleRaw;
  if (!raw || hashNavRaw(raw) !== visibility.rule.contentHash)
    navIntegrityFailure('NAV 研究规则原文缺失或摘要不符');
  const payload: Record<string, unknown> = { ...visibility.rule };
  delete payload.contentHash;
  try {
    if (canonicalizeManifest(JSON.parse(raw)) !== canonicalizeManifest(payload))
      navIntegrityFailure('NAV 研究规则原文内容不符');
  } catch {
    navIntegrityFailure('NAV 研究规则原文无效');
  }
};

export const validateNavResearchFact = (
  fact: BacktestNavSnapshotManifestV3['facts'][number],
  context: NavFrozenContext,
): void => {
  const visibility = context.runConfig.navVisibility;
  const proof = fact.publicationEvidence;
  if (visibility.mode !== 'research-assumption' || proof.kind !== 'research-assumption')
    navIntegrityFailure('NAV 研究模式不符');
  const expected = navResearchVisibility(fact.valuationDate, visibility, context.calendar);
  if (
    proof.disclosureDate !== expected.disclosureDate ||
    fact.availableAt !== expected.assumedAvailableAt ||
    proof.evidenceRef !== visibility.rule.evidenceRef
  ) {
    navIntegrityFailure('NAV 研究可见时间与冻结规则、披露工作日历不符');
  }
};
