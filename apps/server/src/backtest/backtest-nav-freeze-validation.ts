import { z } from 'zod';
import {
  backtestNavFrozenInputV3Schema,
  backtestNavSnapshotManifestV3Schema,
  strategySchema,
  type BacktestNavRunConfigV3,
  type BacktestNavSnapshotManifestV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { planNavSnapshotInputsV3 } from './backtest-nav-input-plan.js';
import type { NavPlanningCalendar } from './backtest-nav-planning-calendar.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { validateNavResearchRule, validateNavResearchFact } from './backtest-nav-visibility.js';
import {
  hashNavRaw,
  navIntegrityFailure,
  validateNavSourceRecords,
} from './backtest-nav-source-evidence.js';
export { hashNavRaw, navIntegrityFailure } from './backtest-nav-source-evidence.js';

export interface NavFrozenContext {
  strategy: BacktestStrategy;
  runConfig: BacktestNavRunConfigV3;
  calendar: NavPlanningCalendar;
  calendarRaw: string;
  responseRaw: string;
  ruleRaw: string | null;
  publicationRecords: Array<{ sourceRecordId: string; rawRecord: string }>;
}

const equal = (a: unknown, b: unknown) => canonicalizeManifest(a) === canonicalizeManifest(b);

export const navFactRow = (fact: BacktestNavSnapshotManifestV3['facts'][number]): ArtifactRow => ({
  ...fact,
  publicationEvidence: canonicalizeManifest(fact.publicationEvidence),
});

export const navContextRow = (context: NavFrozenContext): ArtifactRow => ({
  kind: 'nav-context-v3',
  strategy: canonicalizeManifest(context.strategy),
  runConfig: canonicalizeManifest(context.runConfig),
  calendar: canonicalizeManifest(context.calendar),
  calendarRaw: context.calendarRaw,
  responseRaw: context.responseRaw,
  ruleRaw: canonicalizeManifest(context.ruleRaw),
  publicationRecords: canonicalizeManifest(context.publicationRecords),
});

export const readNavContext = (rows: readonly ArtifactRow[]): NavFrozenContext => {
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row?.kind !== 'nav-context-v3' ||
    !equal(
      Object.keys(row).sort(),
      [
        'kind',
        'strategy',
        'runConfig',
        'calendar',
        'calendarRaw',
        'responseRaw',
        'ruleRaw',
        'publicationRecords',
      ].sort(),
    )
  ) {
    navIntegrityFailure('NAV 冻结上下文格式无效');
  }
  for (const v of Object.values(row))
    if (typeof v !== 'string') navIntegrityFailure('NAV 上下文字段无效');
  try {
    return {
      strategy: strategySchema.parse(JSON.parse(row.strategy as string)) as BacktestStrategy,
      runConfig: backtestNavFrozenInputV3Schema.shape.runConfig.parse(
        JSON.parse(row.runConfig as string),
      ),
      calendar: JSON.parse(row.calendar as string) as NavPlanningCalendar,
      calendarRaw: row.calendarRaw as string,
      responseRaw: row.responseRaw as string,
      ruleRaw: z
        .string()
        .min(1)
        .nullable()
        .parse(JSON.parse(row.ruleRaw as string)),
      publicationRecords: z
        .array(z.strictObject({ sourceRecordId: z.string().min(1), rawRecord: z.string().min(1) }))
        .parse(JSON.parse(row.publicationRecords as string)),
    };
  } catch {
    navIntegrityFailure('NAV 冻结上下文 JSON 或当前合同无效');
  }
};

export const validateNavFrozenInputs = (
  value: unknown,
  context: NavFrozenContext,
): BacktestNavSnapshotManifestV3 => {
  const parsed = backtestNavSnapshotManifestV3Schema.safeParse(value);
  if (!parsed.success) navIntegrityFailure('NAV Manifest 不符合当前冻结合同');
  const manifest = parsed.data;
  validateNavResearchRule(context);
  if (
    !backtestNavFrozenInputV3Schema.safeParse({ manifest, runConfig: context.runConfig }).success
  ) {
    navIntegrityFailure('NAV 配置与 Manifest 不匹配');
  }
  const strategy = strategySchema.parse(context.strategy) as BacktestStrategy;
  const plan = planNavSnapshotInputsV3({
    strategy,
    runConfig: context.runConfig,
    calendar: context.calendar,
  });
  if (
    manifest.strategyVersionHash !== hashCanonicalManifest(strategy) ||
    manifest.runConfigChecksum !== hashCanonicalManifest(context.runConfig) ||
    manifest.executionModel.contentHash !==
      hashCanonicalManifest(context.runConfig.executionModel) ||
    manifest.executionModel.artifactKey !== 'metadata/nav-context-v3.parquet' ||
    manifest.source.responseHash !== hashNavRaw(context.responseRaw)
  ) {
    navIntegrityFailure('NAV 策略、配置、费用模型或来源响应摘要不符');
  }
  const calendar = context.calendar;
  let calendarRecord: unknown;
  try {
    calendarRecord = JSON.parse(context.calendarRaw);
  } catch {
    navIntegrityFailure('NAV 独立日历原文无效');
  }
  const calendarPayload = {
    symbol: calendar.symbol,
    market: calendar.market,
    timezone: calendar.timezone,
    version: calendar.version,
    coverage: calendar.coverage,
    valuationDates: calendar.valuationDates,
    tradingDates: calendar.tradingDates,
    disclosureWorkDates: calendar.disclosureWorkDates,
  };
  if (
    hashNavRaw(context.calendarRaw) !== calendar.contentHash ||
    !equal(calendarRecord, calendarPayload) ||
    !equal(manifest.calendar, {
      market: calendar.market,
      timezone: calendar.timezone,
      version: calendar.version,
      contentHash: calendar.contentHash,
      evidenceRef: calendar.evidenceRef,
      availableAt: calendar.availableAt,
      expectedValuationDates: plan.expectedValuationDates,
    }) ||
    manifest.dateRange.warmupStartDate !== plan.navRange.startDate
  ) {
    navIntegrityFailure('NAV 独立日历原文或计划范围不符');
  }
  validateNavSourceRecords(manifest, context);
  for (const fact of manifest.facts) {
    const proof = fact.publicationEvidence;
    if (proof.kind === 'research-assumption') validateNavResearchFact(fact, context);
  }
  return manifest;
};
