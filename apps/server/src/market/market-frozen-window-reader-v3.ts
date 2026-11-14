import { Inject, Injectable } from '@nestjs/common';
import { MarketRouteRevisionService } from './market-route-revision.service.js';
import { MarketWindowEvidenceV3Repository } from './market-window-evidence-v3.repository.js';
import { deriveFrozenMarketWindowViewV3 } from './market-frozen-window-view-v3.js';
import type {
  MarketBarWindowReadInputV3,
  MarketBarWindowReadResultV3,
} from './market-bar-reader-v3.js';

@Injectable()
export class MarketFrozenWindowReaderV3 {
  constructor(
    @Inject(MarketWindowEvidenceV3Repository)
    private readonly evidence: MarketWindowEvidenceV3Repository,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
  ) {}

  async read(input: MarketBarWindowReadInputV3): Promise<MarketBarWindowReadResultV3> {
    const unavailable = (): MarketBarWindowReadResultV3 => ({
      status: 'unavailable',
      selection: {
        status: 'unavailable',
        reason: 'primary_unavailable',
        primaryFailure: 'invalid_response',
      },
    });
    const reference = input.frozenWindowRef;
    if (!reference) return unavailable();
    let frozen;
    let view;
    try {
      frozen = await this.evidence.findFrozen(reference.identityFingerprint);
      if (!frozen) return unavailable();
      view = deriveFrozenMarketWindowViewV3(frozen, reference, input);
    } catch {
      return unavailable();
    }
    let revisions;
    try {
      revisions = await this.revisions.readCurrent(input.routeKey);
    } catch {
      return {
        status: 'unavailable',
        selection: { status: 'unavailable', reason: 'policy_mismatch' },
      };
    }
    const source = frozen.evidence;
    const selected = revisions.targetSources[source.target.routeIndex];
    const readiness = revisions.availability[source.target.routeIndex];
    if (
      revisions.desiredRevision !== source.desiredRevision ||
      revisions.effectiveRevision !== source.effectivePolicyRevision ||
      selected?.providerId !== source.target.providerId ||
      selected?.upstreamSource !== source.target.upstreamSource ||
      !readiness?.eligible ||
      !readiness.catalogReady ||
      (input.requiredSource &&
        (input.requiredSource.providerId !== source.target.providerId ||
          input.requiredSource.upstreamSource !== source.target.upstreamSource))
    )
      return {
        status: 'unavailable',
        selection: { status: 'unavailable', reason: 'policy_mismatch' },
      };
    // Catalog 是全局准入目录。来源与策略仍一致时，保留父事实，另记当前校验证据。
    const evidence = view.exactWindow && revisions.catalogRevision === source.catalogRevision
      ? source
      : await this.evidence.record({
          request: view.request,
          response: view.response,
          seriesVersion: view.seriesVersion,
          desiredRevision: source.desiredRevision,
          effectivePolicyRevision: source.effectivePolicyRevision,
          catalogRevision: revisions.catalogRevision,
          fetchedAt: source.fetchedAt,
        });
    return {
      status: 'selected',
      request: view.request,
      seriesVersion: view.seriesVersion,
      evidence,
      frozenWindowRef: reference,
      selection: {
        status: 'selected',
        source: source.target.routeIndex === 0 ? 'primary' : 'backup',
        target: {
          providerId: source.target.providerId,
          upstreamSource: source.target.upstreamSource,
        },
        routeIndex: source.target.routeIndex,
        desiredRevision: source.desiredRevision,
        effectivePolicyRevision: source.effectivePolicyRevision,
        catalogRevision: revisions.catalogRevision,
        response: view.response,
      },
    };
  }
}
