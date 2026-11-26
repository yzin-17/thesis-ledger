import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  marketDataBarSeriesResponseV3Schema,
  desiredProviderPolicyV3Schema,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketControlService } from './market-control.service.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { MarketEventFreeRepository } from './market-event-free.repository.js';
import {
  MarketWindowEvidenceV3Repository,
  type PinnedMarketWindowRequestV3,
} from './market-window-evidence-v3.repository.js';
import { marketRouteContextV3 } from './market-window-selector-v3.js';
import { resolveDerivedPriceBasisV3 } from './market-derived-price-basis-v3.js';
import { barSeriesInputFingerprint } from './market-bar-window.js';
import { marketWindowSeriesVersionV3 } from './market-frozen-window-v3.js';
import { withEventFreeTradability } from './market-event-free-tradability.js';
import type {
  MarketBarWindowReadInputV3,
  MarketBarWindowReadResultV3,
} from './market-bar-reader-v3.js';

type SelectedRouteContext = Extract<
  ReturnType<typeof marketRouteContextV3>,
  { ok: true }
>['context'];
type EventFreeTarget = SelectedRouteContext['targets'][number];
type EventFreeSource = NonNullable<
  Awaited<ReturnType<MarketEventFreeRepository['exact']>>
>['bundle']['source'];
function supportsEventFreeInput(input: MarketBarWindowReadInputV3) {
  if (
    !input.priceResearch ||
    input.dailyObservationContract !== undefined ||
    input.frozenWindowRef ||
    input.market !== 'CN' ||
    input.routeKey.assetType !== 'STOCK' ||
    input.routeKey.timeframe !== '1d' ||
    input.routeKey.adjustment !== 'qfq'
  )
    return false;
  return true;
}
function matchingEventFreePrimaries(
  target: EventFreeTarget | undefined,
  rawTarget: EventFreeTarget | undefined,
  source: EventFreeSource,
): target is EventFreeTarget {
  if (
    !target?.eligible ||
    !target.catalogReady ||
    !rawTarget?.eligible ||
    !rawTarget.catalogReady ||
    target.target.providerId !== source.providerId ||
    target.target.upstreamSource !== source.upstreamSource ||
    rawTarget.target.providerId !== source.providerId ||
    rawTarget.target.upstreamSource !== source.upstreamSource
  )
    return false;
  return true;
}

@Injectable()
export class MarketEventFreeReader {
  constructor(
    @Inject(MarketEventFreeRepository) private readonly repository: MarketEventFreeRepository,
    @Inject(MarketControlService) private readonly control: MarketControlService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Inject(MarketPeriodCalendarReader) private readonly calendars: MarketPeriodCalendarReader,
    @Inject(MarketWindowEvidenceV3Repository)
    private readonly evidence: MarketWindowEvidenceV3Repository,
  ) {}

  publishedAt(symbol: string, start: string, end: string) {
    return this.repository.publishedAt(symbol, start, end);
  }

  async read(input: MarketBarWindowReadInputV3): Promise<MarketBarWindowReadResultV3 | null> {
    if (!supportsEventFreeInput(input)) return null;
    const prepared = await this.repository.exact(
      input.symbol,
      input.window.start,
      input.window.end,
    );
    if (!prepared) return null;
    const unavailable = (): MarketBarWindowReadResultV3 => ({
      status: 'unavailable',
      selection: { status: 'unavailable', reason: 'policy_mismatch' },
    });
    const policy = await this.control.getPolicy();
    if (policy.syncState !== 'applied' || policy.effectiveStale !== false) return unavailable();
    const desired = desiredProviderPolicyV3Schema.parse({
      contractVersion: policy.contractVersion,
      consumer: policy.consumer,
      requestId: policy.requestId,
      revision: policy.revision,
      enabled: policy.enabled,
      routes: policy.routes,
    });
    const [envelope, catalog] = await Promise.all([
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    const context = marketRouteContextV3({
      desired,
      effective: envelope.projection?.effective,
      catalog,
      routeKey: input.routeKey,
    });
    const rawContext = marketRouteContextV3({
      desired,
      effective: envelope.projection?.effective,
      catalog,
      routeKey: { ...input.routeKey, adjustment: 'none' },
    });
    if (!context.ok || !rawContext.ok) return unavailable();
    const target = context.context.targets[0],
      rawTarget = rawContext.context.targets[0];
    const source = prepared.bundle.source;
    if (!matchingEventFreePrimaries(target, rawTarget, source)) return unavailable();
    const calendar = await this.calendars.read({
      market: 'CN',
      ...input.window,
      evaluationAsOf: new Date().toISOString(),
    });
    if (calendar.status !== 'ready') return unavailable();
    const dates = [...new Set(calendar.calendar.sessions.map((s) => s.tradingDate))].sort();
    if (dates.join(',') !== prepared.dates.join(',')) return unavailable();
    const request = {
      contractVersion: 1 as const,
      requestId: randomUUID(),
      symbol: input.symbol,
      routeKey: input.routeKey,
      ...input.window,
      routeTarget: { ...target.target, routeIndex: target.routeIndex },
      ...(input.tradabilityMode ? { tradabilityMode: input.tradabilityMode } : {}),
    } as PinnedMarketWindowRequestV3;
    const sourcePriceBasis = resolveDerivedPriceBasisV3(
      prepared.derivedSnapshot,
      prepared.derivedSnapshot.inputFingerprint,
      {
        basisScope: 'request-window',
        dividendMeaning: 'embedded-verified',
        dividendEvidenceRef: `economic-certificate:${prepared.certificateFingerprint}`,
      },
    );
    const bars = prepared.derived.bars;
    let response = marketDataBarSeriesResponseV3Schema.parse({
      contractVersion: 1,
      requestId: request.requestId,
      symbol: input.symbol,
      routeKey: input.routeKey,
      bars,
      coverage: {
        requestedStart: input.window.start,
        requestedEnd: input.window.end,
        actualStart: bars[0]!.timestamp,
        actualEnd: bars.at(-1)!.timestamp,
        hasMoreBefore: false,
        latestCompleteTradingDate: input.window.end,
      },
      coverageProof: {
        calendar: {
          market: 'CN',
          timezone: 'Asia/Shanghai',
          source: 'MarketPeriodCalendarReader/v1',
          revision: calendar.calendar.revision,
          supportedRange: {
            start: calendar.calendar.coverageStart,
            end: calendar.calendar.coverageEnd,
          },
          expectedSessionDates: dates,
        },
        listing: { symbol: input.symbol, status: 'unknown' },
        window: {
          status: 'complete',
          requestedStart: input.window.start,
          requestedEnd: input.window.end,
        },
        pagination: { status: 'complete', pagesFetched: 1, continuationPending: false },
      },
      sourcePriceBasis,
      provenance: {
        ...target.target,
        routeIndex: target.routeIndex,
        effectivePolicyRevision: context.context.effectivePolicyRevision,
      },
      inputFingerprint: barSeriesInputFingerprint(prepared.derived.identity, bars),
    });
    if (input.tradabilityMode)
      response = withEventFreeTradability(response, calendar.calendar.availableAt);
    const seriesVersion = marketWindowSeriesVersionV3(request, response);
    const evidence = await this.evidence.record({
      request,
      response,
      seriesVersion,
      desiredRevision: context.context.desiredRevision,
      effectivePolicyRevision: context.context.effectivePolicyRevision,
      catalogRevision: context.context.catalogRevision,
    });
    if (
      !(await this.sourceStillCurrent(
        input,
        policy,
        desired,
        context.context.catalogRevision,
        source,
      ))
    )
      return unavailable();
    return {
      status: 'selected',
      request,
      seriesVersion,
      evidence,
      selection: {
        status: 'selected',
        source: 'primary',
        response,
        target: target.target,
        routeIndex: target.routeIndex,
        desiredRevision: context.context.desiredRevision,
        effectivePolicyRevision: context.context.effectivePolicyRevision,
        catalogRevision: context.context.catalogRevision,
      },
    };
  }
  private async sourceStillCurrent(
    input: MarketBarWindowReadInputV3,
    policy: Awaited<ReturnType<MarketControlService['getPolicy']>>,
    desired: ReturnType<typeof desiredProviderPolicyV3Schema.parse>,
    catalogRevision: SelectedRouteContext['catalogRevision'],
    source: EventFreeSource,
  ) {
    const after = await this.control.getPolicy();
    if (
      after.revision !== policy.revision ||
      after.enabled !== policy.enabled ||
      after.syncState !== 'applied' ||
      after.effectiveStale !== false
    )
      return false;
    const [currentEffective, currentCatalog] = await Promise.all([
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    for (const adjustment of ['none', 'qfq'] as const) {
      const latest = marketRouteContextV3({
        desired,
        effective: currentEffective.projection?.effective,
        catalog: currentCatalog,
        routeKey: { ...input.routeKey, adjustment },
      });
      if (!latest.ok || latest.context.catalogRevision !== catalogRevision) return false;
      const primary = latest.context.targets[0];
      if (
        !primary?.eligible ||
        !primary.catalogReady ||
        primary.target.providerId !== source.providerId ||
        primary.target.upstreamSource !== source.upstreamSource
      )
        return false;
    }
    return true;
  }
}
