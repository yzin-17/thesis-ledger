import {
  backtestTradingStatusDisclosureV3Schema,
  type MarketTradingStatusResponseV3,
} from '@thesis-ledger/schemas';

type StatusPeriod = {
  state: MarketTradingStatusResponseV3['days'][number]['state'];
  start: string;
  end: string;
};

/** 合同按自然日连续覆盖；仅合并同状态的相邻记录，不推断周末或缺失行情的状态。 */
export const tradingStatusPeriods = (days: MarketTradingStatusResponseV3['days']) => {
  const periods: StatusPeriod[] = [];
  for (const day of days) {
    const last = periods.at(-1);
    if (last?.state === day.state) last.end = day.date;
    else periods.push({ state: day.state, start: day.date, end: day.date });
  }
  return periods;
};

export const tradingStatusDiagnosticExport = (
  value: unknown,
  sanitize: (text: unknown) => string | null,
) => {
  const parsed = backtestTradingStatusDisclosureV3Schema.safeParse(value);
  if (!parsed.success) return undefined;
  const disclosure = parsed.data;
  if (disclosure.status === 'notIncluded')
    return { status: disclosure.status, reason: sanitize(disclosure.reason) };
  const { response } = disclosure;
  const { provenance } = response;
  return {
    status: disclosure.status,
    ...(disclosure.structuredResearch
      ? { structuredResearch: { ...disclosure.structuredResearch } }
      : {}),
    ...(response.basicLifecycle
      ? {
          basicLifecycle: {
            ...response.basicLifecycle,
            reason: sanitize(response.basicLifecycle.reason),
          },
        }
      : {}),
    ...(response.structuredCoverage
      ? { structuredCoverage: { ...response.structuredCoverage } }
      : {}),
    ...(response.sourceRecords
      ? {
          sourceRecords: response.sourceRecords.map((record) => ({
            id: sanitize(record.id),
            kind: record.kind,
            symbol: sanitize(record.symbol),
            range: { ...record.range },
            providerId: sanitize(record.providerId),
            upstreamSource: sanitize(record.upstreamSource),
            queryMethod: sanitize(record.queryMethod),
            queryFields: sanitize(record.queryFields),
            normalizerRevision: sanitize(record.normalizerRevision),
            responseSha256: record.responseSha256,
            observedAt: record.observedAt,
          })),
        }
      : {}),
    ...(disclosure.executionInterpretation
      ? { executionInterpretation: { ...disclosure.executionInterpretation } }
      : {}),
    fallbackReason: sanitize(disclosure.fallbackReason),
    symbol: sanitize(response.symbol),
    range: { start: response.range.start, end: response.range.end },
    days: response.days.map((day) => ({
      date: day.date,
      state: day.state,
      ...(day.coarseST ? { coarseST: day.coarseST } : {}),
      ...(day.sourceRecordIds ? { sourceRecordIds: day.sourceRecordIds.map(sanitize) } : {}),
      ...(day.sourceDocumentIds ? { sourceDocumentIds: day.sourceDocumentIds.map(sanitize) } : {}),
      ...(day.riskWarning ? { riskWarning: { ...day.riskWarning } } : {}),
      ...(day.dailyPriceLimit ? { dailyPriceLimit: { ...day.dailyPriceLimit } } : {}),
      ...(day.listingPhase ? { listingPhase: day.listingPhase } : {}),
      ...(day.noDailyPriceLimit
        ? { noDailyPriceLimit: { reason: sanitize(day.noDailyPriceLimit.reason) } }
        : {}),
      ...(day.intradayHalts
        ? {
            intradayHalts: day.intradayHalts.map((halt) => ({
              ...halt,
              reason: sanitize(halt.reason),
            })),
          }
        : {}),
    })),
    sourceDocuments: response.sourceDocuments.map((document) => ({
      id: sanitize(document.id),
      title: sanitize(document.title),
      url: sanitize(document.url),
      publishedDate: document.publishedDate,
      kind: document.kind,
      ...(document.sha256 ? { sha256: document.sha256 } : {}),
      ...(document.observedAt ? { observedAt: document.observedAt } : {}),
    })),
    provenance: {
      providerId: sanitize(provenance.providerId),
      upstreamSource: sanitize(provenance.upstreamSource),
      providerRevision: sanitize(provenance.providerRevision),
      datasetId: sanitize(provenance.datasetId),
      fetchedAt: provenance.fetchedAt,
      granularity: provenance.granularity,
      ...(provenance.timezone ? { timezone: provenance.timezone } : {}),
      historicalAvailability: provenance.historicalAvailability,
    },
  };
};
