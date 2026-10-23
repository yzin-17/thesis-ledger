import { Inject, Injectable } from '@nestjs/common';
import {
  marketDataBarSeriesResponseV3Schema,
  type ResearchScopeSnapshotV2,
  researchScopeInstrumentsV2,
  type ResearchObservationEvaluation,
  type MarketDataBarSeriesResponseV3,
} from '@thesis-ledger/schemas';
import { MarketPeriodCalendarReader } from '../market/market-period-calendar-reader.js';
import { MarketBarReader, type MarketBarWindowReadResultV3 } from '../market/market-bar-reader.js';
import { researchObservationDigest } from './research-observation-identity.js';
import {
  observationMarketDate,
  observationEvidenceVisibleAt,
  type ObservationCalendar,
  type ObservationPrices,
} from './research-observation-method.js';

export type ObservationInstrument = ReturnType<typeof researchScopeInstrumentsV2>[number];
type MaterialRead<T> = { material: T; audit: unknown };
const unavailable = (
  reason: Extract<ObservationPrices, { status: 'unavailable' }>['reason'],
): ObservationPrices => ({ status: 'unavailable', reason });
const dayAfter = (day: string, days: number) =>
  new Date(Date.parse(day) + days * 86_400_000).toISOString().slice(0, 10);

function qualifyEconomicContext(
  data: MarketDataBarSeriesResponseV3,
  response: Extract<MarketBarWindowReadResultV3, { status: 'selected' }>,
  instrument: ObservationInstrument,
  asOf: string,
) {
  const basis = data.sourcePriceBasis;
  if (
    data.symbol !== instrument.symbol ||
    data.routeKey.market !== instrument.market ||
    data.routeKey.assetType !== instrument.assetType ||
    data.routeKey.adjustment !== 'qfq' ||
    data.routeKey.timeframe !== '1d' ||
    data.provenance.providerId !== response.selection.target.providerId ||
    data.provenance.upstreamSource !== response.selection.target.upstreamSource ||
    response.evidence.inputFingerprint !== data.inputFingerprint ||
    researchObservationDigest(response.evidence.sourcePriceBasis) !==
      researchObservationDigest(basis)
  )
    return 'price_basis_mismatch' as const;
  if (
    basis.basisScope === 'provider-defined' ||
    !basis.anchor ||
    basis.dividendMeaning !== 'embedded-verified' ||
    !basis.dividendEvidenceRef ||
    !observationEvidenceVisibleAt(basis.observedAt, asOf)
  )
    return 'price_basis_unknown' as const;
  return null;
}

/** 复用现行 Market 合同；此接缝不提升日历、价格或来源资格。 */
@Injectable()
export class ResearchObservationMaterials {
  constructor(
    @Inject(MarketPeriodCalendarReader) private readonly calendars: MarketPeriodCalendarReader,
    @Inject(MarketBarReader) private readonly bars: MarketBarReader,
  ) {}
  instrument(snapshot: ResearchScopeSnapshotV2, id: string) {
    return researchScopeInstrumentsV2(snapshot).find((value) => value.instrumentId === id);
  }
  async calendar(
    instrument: ObservationInstrument,
    createdAt: string,
    asOf: string,
  ): Promise<MaterialRead<ObservationCalendar>> {
    if (instrument.market !== 'CN')
      return {
        material: { status: 'unavailable', reason: 'calendar_unqualified' } as ObservationCalendar,
        audit: { status: 'unavailable', reason: 'calendar_unqualified', market: instrument.market },
      };
    const start = observationMarketDate(createdAt, 'Asia/Shanghai');
    const request = {
      market: 'CN' as const,
      start,
      end: dayAfter(start, 120),
      evaluationAsOf: asOf,
    };
    const response = await this.calendars.read(request);
    let material: ObservationCalendar = { status: 'unavailable', reason: 'calendar_unqualified' };
    if (response.status === 'ready') material = response;
    else if (response.reason === 'calendar_incomplete')
      material = { status: 'unavailable', reason: 'calendar_incomplete' };
    else if (response.reason === 'calendar_unavailable')
      material = { status: 'unavailable', reason: 'calendar_unavailable' };
    return { material, audit: { request, response } };
  }
  async prices(
    instrument: ObservationInstrument,
    window: ResearchObservationEvaluation['window'],
    calendar: ObservationCalendar,
    asOf: string,
  ): Promise<MaterialRead<ObservationPrices>> {
    if (
      !window.startSession ||
      !window.endSession ||
      calendar.status !== 'ready' ||
      instrument.market !== 'CN' ||
      instrument.currency !== 'CNY' ||
      (instrument.assetType !== 'STOCK' && instrument.assetType !== 'ETF')
    )
      return { material: unavailable('price_basis_unknown'), audit: { status: 'not_requested' } };
    const request = {
      market: instrument.market,
      symbol: instrument.symbol,
      routeKey: {
        kind: 'bar' as const,
        market: instrument.market,
        assetType: instrument.assetType,
        capability: 'DAILY_BAR' as const,
        timeframe: '1d' as const,
        adjustment: 'qfq' as const,
      },
      window: { start: window.startSession, end: window.endSession },
      priceResearch: true,
      tradabilityMode: 'assume-untradable-no-bar' as const,
    };
    const response = await this.bars.readV3(request);
    const audit = { request, response };
    if (response.status !== 'selected')
      return { material: unavailable('price_unavailable'), audit };
    const parsed = marketDataBarSeriesResponseV3Schema.safeParse(response.selection.response);
    if (!parsed.success) return { material: unavailable('coverage_incomplete'), audit };
    const data = parsed.data;
    const contextFailure = qualifyEconomicContext(data, response, instrument, asOf);
    if (contextFailure) return { material: unavailable(contextFailure), audit };
    const expected = [...new Set(calendar.calendar.sessions.map((session) => session.tradingDate))]
      .filter((date) => date >= window.startSession! && date <= window.endSession!)
      .sort();
    if (
      data.coverage.requestedStart !== window.startSession ||
      data.coverage.requestedEnd !== window.endSession ||
      !data.coverage.latestCompleteTradingDate ||
      data.coverage.latestCompleteTradingDate < window.endSession ||
      data.coverageProof.calendar.expectedSessionDates.join(',') !== expected.join(',')
    )
      return { material: unavailable('coverage_incomplete'), audit };
    const points = data.bars.map((point) => {
      let state: 'traded' | 'unknown' = 'unknown';
      if (point.completionStatus === 'complete' && point.volume !== null && point.volume > 0)
        state = 'traded';
      return {
        date: observationMarketDate(point.timestamp, calendar.calendar.timezone),
        close: String(point.close),
        availableAt: point.availableAt,
        state,
      };
    });
    const material: ObservationPrices = {
      status: 'ready',
      currency: instrument.currency,
      fingerprint: researchObservationDigest(audit),
      points,
    };
    return { material, audit };
  }
}
