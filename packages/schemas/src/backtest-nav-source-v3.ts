import { z } from 'zod';
import { backtestNavFactV3Schema, backtestNavRouteKeyV3Schema } from './backtest-nav-freeze-v3.js';
import { backtestNavPlanningCalendarV3Schema } from './backtest-nav-calendar-v3.js';
import { backtestNavVisibilityV3Schema } from './backtest-nav-visibility-v3.js';
import { marketRouteAdmissionV3Schema } from './market-route-admission-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

const text = z.string().trim().min(1);
const raw = z.string().min(1);
const instant = z.iso.datetime({ offset: true });
const target = z.strictObject({
  providerId: z.literal('efinance'),
  upstreamSource: z.literal('eastmoney'),
  routeIndex: z.number().int().min(0).max(1),
});
const identity = {
  contractVersion: z.literal(3),
  requestId: text.max(128),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  routeKey: backtestNavRouteKeyV3Schema,
  routeTarget: target,
  desiredRevision: z.number().int().positive(),
  effectivePolicyRevision: z.number().int().positive(),
  catalogRevision: z.number().int().positive(),
  dataAsOf: instant,
};

/** 来源日期及可见时间假设必须由调用方显式决定。 */
export const backtestNavSourceRequestV3Schema = z
  .strictObject({
    ...identity,
    fundType: z.enum(['domestic', 'qdii']),
    start: z.iso.date(),
    end: z.iso.date(),
    warmupPeriods: z.number().int().min(1).max(100000),
    tailTradingDays: z.number().int().min(1).max(104),
    visibilityMode: z.enum(['strict-publication', 'research-assumption']),
    calendarDecisionRaw: raw.max(65536),
    domesticRuleDecisionRaw: raw.max(65536).nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.start > value.end ||
      value.desiredRevision !== value.effectivePolicyRevision ||
      (value.fundType === 'domestic') !== (value.domesticRuleDecisionRaw !== null)
    ) {
      ctx.addIssue({ code: 'custom', message: '净值请求日期、策略版本或规则决定无效' });
    }
  });

/** 独立精确接口输出；来源原文随证据冻结，研究假设不能充当发布时间。 */
const responseSchema = z.strictObject({
  ...identity,
  coverage: z.strictObject({
    complete: z.literal(true),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  }),
  source: z.strictObject({
    adapterRevision: z.literal('efinance-fund-nav-raw-v1'),
    sourceRevision: z.literal('eastmoney-fund-nav-raw-v1'),
    providerRevision: text,
    credentialRevision: z.literal('not-required'),
    responseHash: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: instant,
  }),
  admission: marketRouteAdmissionV3Schema,
  calendar: backtestNavPlanningCalendarV3Schema,
  navVisibility: backtestNavVisibilityV3Schema,
  facts: z.array(backtestNavFactV3Schema).min(1),
  publicationRecords: z.array(z.strictObject({ sourceRecordId: text, rawRecord: raw })).min(1),
  responseRaw: raw,
  ruleRaw: raw,
  calendarRaw: raw,
  assumptionRaw: raw,
  calendarDecisionRaw: raw,
});

const before = (a: string, b: string) => {
  const result = compareMarketPitEvidenceInstantStringsV1(a, b);
  return result !== undefined && result <= 0;
};

/** 精确准入的身份、范围及有效期绑定。 */
const admissionMatches = (value: z.infer<typeof responseSchema>): boolean => {
  const { admission, source, calendar } = value;
  return (
    JSON.stringify(admission.routeKey) === JSON.stringify(value.routeKey) &&
    admission.target.providerId === value.routeTarget.providerId &&
    admission.target.upstreamSource === value.routeTarget.upstreamSource &&
    admission.adapterRevision === source.adapterRevision &&
    admission.sourceRevision === source.sourceRevision &&
    admission.credentialRevision === source.credentialRevision &&
    admission.scopeSymbols.includes(value.symbol) &&
    admission.scopeDateFrom <= calendar.coverage.startDate &&
    admission.scopeDateTo >= calendar.coverage.endDate &&
    before(admission.recordedAt, source.capturedAt) &&
    before(admission.validFrom, source.capturedAt) &&
    !before(admission.validUntil, source.capturedAt)
  );
};

export const backtestNavSourceResponseV3Schema = responseSchema.superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const { source, calendar, coverage } = value;
  if (
    value.desiredRevision !== value.effectivePolicyRevision ||
    !before(source.capturedAt, value.dataAsOf) ||
    !before(calendar.availableAt, source.capturedAt)
  ) {
    fail('策略版本或来源时间不一致');
  }
  if (!admissionMatches(value)) fail('准入身份、范围或有效期不一致');
  if (
    calendar.symbol !== value.symbol ||
    coverage.startDate !== calendar.coverage.startDate ||
    coverage.endDate > calendar.coverage.endDate ||
    coverage.startDate > coverage.endDate
  )
    fail('日期覆盖不一致');
  for (const dates of [
    calendar.valuationDates,
    calendar.tradingDates,
    calendar.disclosureWorkDates,
  ]) {
    if (
      dates.some(
        (day, i) =>
          day < calendar.coverage.startDate ||
          day > calendar.coverage.endDate ||
          (i > 0 && day <= dates[i - 1]!),
      )
    )
      fail('日历日期必须升序、唯一且在覆盖区间内');
  }
  const expected = calendar.valuationDates.filter((day) => day <= coverage.endDate);
  if (
    value.facts.length !== expected.length ||
    value.publicationRecords.length !== expected.length ||
    new Set(value.publicationRecords.map((record) => record.sourceRecordId)).size !==
      expected.length
  ) {
    fail('净值记录未完整覆盖日期或来源记录重复');
  }
  const visibility = value.navVisibility;
  if (visibility.mode !== 'research-assumption') {
    fail('此来源仅支持显式研究模式');
    return;
  }
  if (
    visibility.rule.symbol !== value.symbol ||
    visibility.disclosureCalendarHash !== calendar.contentHash
  ) {
    fail('规则或披露日历身份不一致');
  }
  value.facts.forEach((fact, i) => {
    const proof = fact.publicationEvidence;
    if (
      fact.symbol !== value.symbol ||
      fact.valuationDate !== expected[i] ||
      !before(fact.availableAt, value.dataAsOf) ||
      proof.kind !== 'research-assumption'
    ) {
      fail('净值身份、日期或可见性无效');
      return;
    }
    if (
      proof.ruleHash !== visibility.rule.contentHash ||
      proof.evidenceRef !== visibility.rule.evidenceRef ||
      proof.disclosureCalendarHash !== calendar.contentHash ||
      proof.assumedAvailableAt !== fact.availableAt ||
      proof.sourceRecordId !== value.publicationRecords[i]?.sourceRecordId
    )
      fail('净值来源证据绑定不一致');
  });
});

export type BacktestNavSourceRequestV3 = z.infer<typeof backtestNavSourceRequestV3Schema>;
export type BacktestNavSourceResponseV3 = z.infer<typeof backtestNavSourceResponseV3Schema>;
