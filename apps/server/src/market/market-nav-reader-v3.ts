import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import {
  backtestNavSourceRequestV3Schema,
  backtestNavSourceResponseV3Schema,
  type BacktestNavSourceRequestV3,
  type BacktestNavSourceResponseV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { DsaNavClient } from '../integration/dsa/dsa-nav-client.js';
import { DsaV3ProtocolError } from '../integration/dsa/dsa-v3-protocol.js';
import { MarketControlService } from './market-control.service.js';
import { navRouteState } from './market-nav-route-v3.js';

export type MarketNavReadInputV3 = Omit<
  BacktestNavSourceRequestV3,
  'routeTarget' | 'desiredRevision' | 'effectivePolicyRevision' | 'catalogRevision'
>;

@Injectable()
export class MarketNavReaderV3 {
  constructor(
    @Inject(MarketControlService) private readonly control: MarketControlService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Inject(DsaNavClient) private readonly nav: DsaNavClient,
  ) {}

  private async capture(key: BacktestNavSourceRequestV3['routeKey']) {
    const [policy, envelope, catalog] = await Promise.all([
      this.control.getPolicy(),
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    if (policy.syncState !== 'applied' || policy.effectiveStale !== false) {
      throw new DsaV3ProtocolError('净值策略尚未应用或已经陈旧', 'control-rejected');
    }
    return navRouteState(
      {
        contractVersion: policy.contractVersion,
        consumer: policy.consumer,
        requestId: policy.requestId,
        revision: policy.revision,
        enabled: policy.enabled,
        routes: policy.routes,
      },
      envelope.projection?.effective,
      catalog,
      key,
    );
  }

  /** 创建守卫只复核当前路由，不再次采集净值或更改冻结时点。 */
  async currentRouteState(key: BacktestNavSourceRequestV3['routeKey']) {
    const before = await this.capture(key);
    const after = await this.capture(key);
    if (!isDeepStrictEqual(before, after)) {
      throw new DsaV3ProtocolError('净值创建复核期间路由状态改变', 'stale-revision');
    }
    return after;
  }

  async read(input: MarketNavReadInputV3) {
    const validated = backtestNavSourceRequestV3Schema.parse({
      ...input,
      routeTarget: { providerId: 'efinance', upstreamSource: 'eastmoney', routeIndex: 0 },
      desiredRevision: 1,
      effectivePolicyRevision: 1,
      catalogRevision: 1,
    });
    const before = await this.capture(validated.routeKey);
    const request = backtestNavSourceRequestV3Schema.parse({
      ...validated,
      routeTarget: before.routeTarget,
      desiredRevision: before.desiredRevision,
      effectivePolicyRevision: before.effectivePolicyRevision,
      catalogRevision: before.catalogRevision,
    });
    const response = backtestNavSourceResponseV3Schema.parse(await this.nav.read(request));
    const after = await this.capture(request.routeKey);
    if (!isDeepStrictEqual(before, after)) {
      throw new DsaV3ProtocolError('净值读取期间路由状态改变', 'stale-revision');
    }
    assertCurrentNavResponse(request, response);
    return { request, response, routeState: after };
  }
}

function assertCurrentNavResponse(
  request: BacktestNavSourceRequestV3,
  response: BacktestNavSourceResponseV3,
) {
  const identity = [
    'requestId',
    'symbol',
    'routeKey',
    'routeTarget',
    'desiredRevision',
    'effectivePolicyRevision',
    'catalogRevision',
    'dataAsOf',
  ] as const;
  if (identity.some((key) => !isDeepStrictEqual(request[key], response[key]))) {
    throw new DsaV3ProtocolError('净值响应不属于所选请求与来源', 'invalid-response');
  }
  const admission = response.admission;
  const now = Date.now();
  if (
    !isDeepStrictEqual(admission.routeKey, request.routeKey) ||
    admission.target.providerId !== request.routeTarget.providerId ||
    admission.target.upstreamSource !== request.routeTarget.upstreamSource ||
    !admission.scopeSymbols.includes(request.symbol) ||
    admission.scopeDateFrom > response.calendar.coverage.startDate ||
    admission.scopeDateTo < response.calendar.coverage.endDate ||
    Date.parse(admission.validFrom) > now ||
    Date.parse(admission.validUntil) <= now ||
    Date.parse(admission.recordedAt) > now ||
    admission.adapterRevision !== response.source.adapterRevision ||
    admission.sourceRevision !== response.source.sourceRevision ||
    admission.credentialRevision !== response.source.credentialRevision
  ) {
    throw new DsaV3ProtocolError('净值准入范围、来源修订或当前有效期不匹配', 'control-rejected');
  }
}
