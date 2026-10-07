import type { BacktestNavRunConfigV3 } from '@thesis-ledger/schemas';
import { canonicalizeManifest } from '../../src/backtest/backtest-snapshot.js';
import { hashNavRaw } from '../../src/backtest/backtest-nav-freeze-validation.js';
import { navResearchVisibility } from '../../src/backtest/backtest-nav-visibility.js';
import { navFreezeFixture } from './nav-freeze.fixtures.js';

/** 合同测试的控制规则与日历；不代表该代码真实基金的披露规则。 */
export const navResearchFixture = (delayWorkdays = 1, extraDisclosureDates: string[] = []) => {
  const input = navFreezeFixture('research-run');
  const calendar = input.context.calendar;
  calendar.disclosureWorkDates = calendar.disclosureWorkDates.filter((day) => day !== '2026-09-14');
  calendar.disclosureWorkDates.push(...extraDisclosureDates);
  if (extraDisclosureDates.length > 0) calendar.coverage.endDate = extraDisclosureDates.at(-1)!;
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
  input.context.calendarRaw = canonicalizeManifest(calendarPayload);
  calendar.contentHash = hashNavRaw(input.context.calendarRaw);
  const rule = {
    id: 'controlled-rule',
    version: '1',
    symbol: input.context.runConfig.navInput.symbol,
    fundType: delayWorkdays === 1 ? ('domestic' as const) : ('qdii' as const),
    applicableRange: { startDate: '2026-09-07', endDate: '2026-09-15' },
    delayWorkdays,
    basis: delayWorkdays === 1 ? ('domestic-default' as const) : ('verified-fund-rule' as const),
    evidenceRef: 'fixture://disclosure-rule',
    documentHash: hashNavRaw('控制来源文件'),
    configuredAt: '2026-09-01T00:00:00Z',
  };
  input.context.ruleRaw = canonicalizeManifest(rule);
  const visibility: Extract<
    BacktestNavRunConfigV3['navVisibility'],
    { mode: 'research-assumption' }
  > = {
    mode: 'research-assumption',
    boundary: 'after-disclosure-day-end',
    timezone: 'Asia/Shanghai',
    rule: { ...rule, contentHash: hashNavRaw(input.context.ruleRaw) },
    disclosureCalendarHash: calendar.contentHash,
  };
  input.context.runConfig.navVisibility = visibility;
  const records = input.facts.map((fact) => ({
    sourceRecordId: fact.publicationEvidence.sourceRecordId,
    symbol: fact.symbol,
    valuationDate: fact.valuationDate,
    nav: fact.nav,
    nativeField: '没有发布时间的来源净值',
  }));
  input.context.responseRaw = JSON.stringify({ records });
  input.source.responseHash = hashNavRaw(input.context.responseRaw);
  input.context.publicationRecords = records.map((record) => ({
    sourceRecordId: record.sourceRecordId,
    rawRecord: JSON.stringify(record),
  }));
  input.facts = input.facts.map((fact, index) => {
    const assumed = navResearchVisibility(fact.valuationDate, visibility, calendar);
    return {
      ...fact,
      availableAt: assumed.assumedAvailableAt,
      publicationEvidence: {
        kind: 'research-assumption',
        sourceRecordId: records[index]!.sourceRecordId,
        rawRecordHash: hashNavRaw(input.context.publicationRecords[index]!.rawRecord),
        evidenceRef: visibility.rule.evidenceRef,
        ruleHash: visibility.rule.contentHash,
        disclosureCalendarHash: calendar.contentHash,
        ...assumed,
      },
    };
  });
  return input;
};
