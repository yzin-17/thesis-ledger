import { z } from 'zod';

const date = z.iso.date();
const text = z.string().trim().min(1);
export const structuredStatusRecordSchema = z.strictObject({
  id: text,
  kind: z.literal('normalizedQueryResponse'),
  providerId: text,
  upstreamSource: text,
  symbol: text,
  range: z.strictObject({ start: date, end: date }),
  queryMethod: text,
  queryFields: text,
  normalizerRevision: text,
  responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.iso.datetime({ offset: true }),
});
export const structuredStatusCoverageSchema = z.strictObject({
  expectedSessions: z.array(date),
  calendarUnknownDates: z.array(date),
  statusUnknownDates: z.array(date),
  stUnknownDates: z.array(date),
  complete: z.boolean(),
});

/** 结构化记录只证明日状态与粗 ST；公告专属精细规则仍引用原件。 */
export function structuredStatusIssues(value: {
  symbol: string;
  range: { start: string; end: string };
  days: Array<{
    date: string;
    state: string;
    coarseST?: string | undefined;
    sourceRecordIds?: string[] | undefined;
    sourceDocumentIds?: string[] | undefined;
    riskWarning?: unknown;
    dailyPriceLimit?: unknown;
    listingPhase?: unknown;
    noDailyPriceLimit?: unknown;
    intradayHalts?: unknown;
  }>;
  sourceRecords?: z.infer<typeof structuredStatusRecordSchema>[] | undefined;
  structuredCoverage?: z.infer<typeof structuredStatusCoverageSchema> | undefined;
  provenance: { providerId: string; upstreamSource: string; fetchedAt: string };
}): string[] {
  const issues: string[] = [];
  const records = value.sourceRecords ?? [];
  const ids = new Set(records.map((record) => record.id));
  if (ids.size !== records.length) issues.push('结构化来源引用重复');
  for (const record of records) {
    if (
      record.providerId !== value.provenance.providerId ||
      record.upstreamSource !== value.provenance.upstreamSource ||
      record.symbol !== value.symbol ||
      record.range.start !== value.range.start ||
      record.range.end !== value.range.end ||
      Date.parse(record.observedAt) > Date.parse(value.provenance.fetchedAt)
    )
      issues.push('结构化来源身份、窗口或观察时钟不符');
  }
  for (const day of value.days) {
    if (day.sourceRecordIds?.some((id) => !ids.has(id))) issues.push('结构化日级事实引用缺失');
    if (day.sourceRecordIds && new Set(day.sourceRecordIds).size !== day.sourceRecordIds.length)
      issues.push('结构化日级来源引用重复');
    if (day.coarseST && !day.sourceRecordIds) issues.push('粗 ST 标记缺少结构化来源');
    const precise =
      day.riskWarning ||
      day.dailyPriceLimit ||
      day.listingPhase ||
      day.noDailyPriceLimit ||
      day.intradayHalts;
    if (precise && !day.sourceDocumentIds) issues.push('精细规则不能仅由结构化日级标记证明');
  }
  const coverage = value.structuredCoverage;
  if (Boolean(coverage) !== Boolean(records.length))
    issues.push('结构化响应必须分别保留覆盖与实际来源');
  if (!coverage) return issues;
  for (const dates of [
    coverage.expectedSessions,
    coverage.calendarUnknownDates,
    coverage.statusUnknownDates,
    coverage.stUnknownDates,
  ]) {
    if (
      dates.some(
        (day, index) =>
          day < value.range.start ||
          day > value.range.end ||
          (index > 0 && day <= dates[index - 1]!),
      )
    )
      issues.push('结构化覆盖日期非法、重复或乱序');
  }
  const days = new Map(value.days.map((day) => [day.date, day]));
  if (
    coverage.calendarUnknownDates.some((day) => coverage.expectedSessions.includes(day)) ||
    value.days.some((day) => day.sourceRecordIds && !coverage.expectedSessions.includes(day.date))
  )
    issues.push('已知结构化事实必须对应已核实交易日');
  const missing = coverage.expectedSessions.filter((day) => days.get(day)?.state === 'unknown');
  const stMissing = coverage.expectedSessions.filter((day) => !days.get(day)?.coarseST);
  if (
    JSON.stringify(missing) !== JSON.stringify(coverage.statusUnknownDates) ||
    JSON.stringify(stMissing) !== JSON.stringify(coverage.stUnknownDates) ||
    coverage.complete !== (!coverage.calendarUnknownDates.length && !missing.length)
  )
    issues.push('结构化覆盖与逐日已知/未知事实不一致');
  return issues;
}
