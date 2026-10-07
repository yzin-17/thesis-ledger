import { z } from 'zod';
import type {
  BacktestNavSourceRequestV3,
  BacktestNavSourceResponseV3,
} from '@thesis-ledger/schemas';
import type { NavEnvelope } from './dsa-nav-envelope.js';
import { navEqual, navHash, navInvalid, navTimeBefore, parseNavRaw } from './dsa-nav-raw.js';

const decisionSchema = z.strictObject({
  schemaVersion: z.literal('nav-research-calendar-decision-v1'),
  symbol: z.string(),
  basis: z.literal('nav-dates-xshg-intersection-v1'),
  configuredAt: z.iso.datetime({ offset: true }),
  decision: z.string().trim().min(1),
});
const assumptionSchema = z.strictObject({
  schemaVersion: z.literal('nav-research-calendar-assumption-v1'),
  symbol: z.string(),
  decisionHash: z.string(),
  sourceHash: z.string(),
  sourceRevision: z.literal('eastmoney-fund-nav-raw-v1'),
  sourceCapturedAt: z.iso.datetime({ offset: true }),
  ruleHash: z.string(),
  exchangeCalendar: z.strictObject({
    adapterRevision: z.literal('release-evidence-v1'),
    calendar: z.literal('XSHG'),
    availableAt: z.literal('2026-03-10T03:24:37.055242+00:00'),
    version: z.literal('4.13.2'),
    sourceHash: z.literal('3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea'),
  }),
  valuationBasis: z.literal('source-nav-dates'),
  processingBasis: z.literal('nav-dates-xshg-intersection'),
  disclosureBasis: z.literal('xshg-workdays'),
  missingDate: z.literal('untradable'),
  limitations: z.tuple([
    z.literal('historical-suspension'),
    z.literal('subscription-limits'),
    z.literal('investor-channel-differences'),
  ]),
});

export function verifyNavCalendar(
  request: BacktestNavSourceRequestV3,
  response: BacktestNavSourceResponseV3,
  envelope: NavEnvelope,
  sourceDates: string[],
) {
  const { calendar, navVisibility: visibility } = response;
  if (visibility.mode !== 'research-assumption') navInvalid();
  const decision = decisionSchema.parse(parseNavRaw(response.calendarDecisionRaw));
  const assumption = assumptionSchema.parse(parseNavRaw(response.assumptionRaw));
  if (
    decision.symbol !== request.symbol ||
    assumption.symbol !== request.symbol ||
    assumption.decisionHash !== navHash(request.calendarDecisionRaw) ||
    assumption.sourceHash !== envelope.navSource.contentHash ||
    assumption.sourceCapturedAt !== envelope.navSource.capturedAt ||
    assumption.ruleHash !== visibility.rule.contentHash
  )
    navInvalid();
  navTimeBefore(decision.configuredAt, response.source.capturedAt);
  navTimeBefore(assumption.exchangeCalendar.availableAt, response.source.capturedAt);
  const { contentHash, evidenceRef, availableAt, ...payload } = calendar;
  const assumptionHash = navHash(response.assumptionRaw);
  if (
    contentHash !== navHash(response.calendarRaw) ||
    !navEqual(parseNavRaw(response.calendarRaw), payload) ||
    calendar.version !== `nav-research-calendar-v1:${assumptionHash}` ||
    evidenceRef !== `research-config://nav-calendar/${assumptionHash}`
  )
    navInvalid();
  navTimeBefore(availableAt, response.source.capturedAt);
  const { startDate, endDate } = calendar.coverage;
  const valuation = sourceDates.filter((day) => day >= startDate && day <= endDate);
  const work = new Set(calendar.disclosureWorkDates);
  if (
    !navEqual(valuation, calendar.valuationDates) ||
    !navEqual(
      valuation.filter((day) => work.has(day)),
      calendar.tradingDates,
    )
  )
    navInvalid();
  const preceding = sourceDates.filter((day) => day < request.start).slice(-request.warmupPeriods);
  const tail = calendar.tradingDates.filter((day) => day > request.end);
  if (
    preceding.length !== request.warmupPeriods ||
    preceding[0] !== startDate ||
    tail.length < request.tailTradingDays ||
    response.coverage.endDate !== request.end ||
    response.coverage.startDate !== startDate
  )
    navInvalid();
  verifyNavDisclosure(response);
}

function verifyNavDisclosure(response: BacktestNavSourceResponseV3) {
  const visibility = response.navVisibility;
  if (visibility.mode !== 'research-assumption') navInvalid();
  for (const fact of response.facts) {
    const proof = fact.publicationEvidence;
    const day = response.calendar.disclosureWorkDates.filter((date) => date > fact.valuationDate)[
      visibility.rule.delayWorkdays - 1
    ];
    if (
      !day ||
      proof.kind !== 'research-assumption' ||
      fact.valuationDate < visibility.rule.applicableRange.startDate ||
      fact.valuationDate > visibility.rule.applicableRange.endDate
    )
      navInvalid();
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const expected = `${next.toISOString().slice(0, 10)}T00:00:00+08:00`;
    if (
      proof.disclosureDate !== day ||
      proof.assumedAvailableAt !== expected ||
      fact.availableAt !== expected
    )
      navInvalid();
  }
}
