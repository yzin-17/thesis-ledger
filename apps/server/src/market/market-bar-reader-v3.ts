import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  desiredProviderPolicyV3Schema,
  marketDataBarRouteKeyV3Schema,
  marketDataBarSeriesRequestV3Schema,
  type MarketDataBarRouteKeyV3,
  type MarketDataBarSeriesRequestV3,
  type MarketFrozenWindowRefV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import type { EffectivePolicyEnvelopeV3 } from '../integration/dsa/dsa-v3-protocol.js';
import { MarketControlService } from './market-control.service.js';
import {
  MarketWindowEvidenceV3Repository,
  type PinnedMarketWindowRequestV3,
  type StoredMarketWindowEvidenceV3,
} from './market-window-evidence-v3.repository.js';
import {
  selectMarketWindowV3,
  type MarketWindowSelectionInputV3,
  type MarketWindowSelectionV3,
} from './market-window-selector-v3.js';
import { marketWindowSeriesVersionV3 } from './market-frozen-window-v3.js';
import { MarketFrozenWindowReaderV3 } from './market-frozen-window-reader-v3.js';

export type MarketBarWindowReadInputV3 = {
  market: MarketDataBarRouteKeyV3['market'];
  symbol: string;
  routeKey: MarketDataBarRouteKeyV3;
  window: { start: string; end: string };
  compatibility?: MarketWindowSelectionInputV3['compatibility'];
  warmup?: MarketWindowSelectionInputV3['warmup'];
  frozenWindowRef?: MarketFrozenWindowRefV3;
  tradabilityMode?: 'assume-untradable-no-bar';
  priceResearch?: boolean;
};

type SelectedWindowV3 = Extract<MarketWindowSelectionV3, { status: 'selected' }>;
type UnavailableWindowV3 = Extract<MarketWindowSelectionV3, { status: 'unavailable' }>;

export type MarketBarWindowReadResultV3 =
  | {
      status: 'selected';
      selection: SelectedWindowV3;
      request: PinnedMarketWindowRequestV3;
      seriesVersion: string;
      evidence: StoredMarketWindowEvidenceV3;
      frozenWindowRef?: MarketFrozenWindowRefV3;
    }
  | { status: 'unavailable'; selection: UnavailableWindowV3 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const unavailable = (reason: UnavailableWindowV3['reason']): MarketBarWindowReadResultV3 => ({
  status: 'unavailable',
  selection: { status: 'unavailable', reason },
});

const desiredPolicyProjection = (value: unknown) => {
  if (!isRecord(value) || value.syncState !== 'applied' || value.effectiveStale !== false) {
    return null;
  }
  const desired = desiredProviderPolicyV3Schema.safeParse({
    contractVersion: value.contractVersion,
    consumer: value.consumer,
    requestId: value.requestId,
    revision: value.revision,
    enabled: value.enabled,
    routes: value.routes,
  });
  return desired.success ? desired.data : null;
};

const createPinnedRequest = (
  request: MarketDataBarSeriesRequestV3,
  target: { providerId: string; upstreamSource: string },
  routeIndex: number,
): PinnedMarketWindowRequestV3 =>
  marketDataBarSeriesRequestV3Schema.parse({
    ...request,
    routeTarget: { ...target, routeIndex },
  }) as PinnedMarketWindowRequestV3;

@Injectable()
export class MarketBarWindowReaderV3 {
  constructor(
    private readonly marketControl: MarketControlService,
    private readonly dsa: DsaClient,
    private readonly evidenceRepository: MarketWindowEvidenceV3Repository,
    @Optional() @Inject(MarketFrozenWindowReaderV3) private readonly frozenReader?: MarketFrozenWindowReaderV3,
  ) {}

  async read(input: MarketBarWindowReadInputV3): Promise<MarketBarWindowReadResultV3> {
    if (input.frozenWindowRef) return this.frozenReader?.read(input) ?? unavailable('invalid_input');
    const routeKey = marketDataBarRouteKeyV3Schema.safeParse(input.routeKey);
    if (!routeKey.success || routeKey.data.market !== input.market) {
      return unavailable('invalid_input');
    }
    const validatedRequest = marketDataBarSeriesRequestV3Schema.safeParse({
      contractVersion: 3,
      requestId: 'market-window-v3-input-check',
      symbol: input.symbol,
      routeKey: routeKey.data,
      start: input.window.start,
      end: input.window.end,
      ...(input.tradabilityMode ? { tradabilityMode: input.tradabilityMode } : {}),
    });
    if (!validatedRequest.success) return unavailable('invalid_input');
    if (routeKey.data.capability !== 'DAILY_BAR' || routeKey.data.timeframe !== '1d') {
      return unavailable('unsupported_granularity');
    }

    let desiredResponse: unknown;
    try {
      desiredResponse = await this.marketControl.getPolicy();
    } catch {
      return unavailable('policy_mismatch');
    }
    const desired = desiredPolicyProjection(desiredResponse);
    if (!desired) return unavailable('policy_mismatch');

    const [effectiveResult, catalogResult] = await Promise.allSettled([
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    if (effectiveResult.status === 'rejected') return unavailable('policy_mismatch');
    if (catalogResult.status === 'rejected') return unavailable('catalog_unavailable');
    const effectiveEnvelope: EffectivePolicyEnvelopeV3 = effectiveResult.value;
    const effective = effectiveEnvelope.projection?.effective ?? null;
    const catalog = catalogResult.value;

    const requests = new Map<number, PinnedMarketWindowRequestV3>();
    const selection = await selectMarketWindowV3({
      desired,
      effective,
      catalog,
      routeKey: routeKey.data,
      symbol: validatedRequest.data.symbol,
      window: { start: validatedRequest.data.start, end: validatedRequest.data.end },
      requestId: randomUUID(),
      now: new Date().toISOString(),
      ...(input.priceResearch ? { priceResearch: true } : {}),
      ...(input.tradabilityMode ? { tradabilityMode: input.tradabilityMode } : {}),
      readCapabilities: () => this.dsa.marketDataCapabilitiesV3(),
      ...(input.compatibility ? { compatibility: input.compatibility } : {}),
      ...(input.warmup ? { warmup: input.warmup } : {}),
      read: async ({ request, target, routeIndex }) => {
        const pinnedRequest = createPinnedRequest(request, target, routeIndex);
        requests.set(routeIndex, pinnedRequest);
        return this.dsa.marketBarsV3(pinnedRequest);
      },
    });
    if (selection.status !== 'selected') {
      return { status: 'unavailable', selection };
    }

    const request = requests.get(selection.routeIndex);
    if (!request) throw new Error('V3 选择结果缺少对应的 pinned request');
    const seriesVersion = marketWindowSeriesVersionV3(request, selection.response);
    const evidence = await this.evidenceRepository.record({
      request,
      response: selection.response,
      seriesVersion,
      desiredRevision: selection.desiredRevision,
      effectivePolicyRevision: selection.effectivePolicyRevision,
      catalogRevision: selection.catalogRevision,
    });
    return { status: 'selected', selection, request, seriesVersion, evidence };
  }
}
