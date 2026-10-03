import { Inject, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  desiredProviderPolicyV3Schema,
  type MarketDataBarRouteKeyV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketControlService } from './market-control.service.js';
import { marketRouteContextV3 } from './market-window-selector-v3.js';

@Injectable()
export class MarketRouteRevisionService {
  constructor(
    @Inject(MarketControlService) private readonly control: MarketControlService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
  ) {}

  private async capture(routeKey: MarketDataBarRouteKeyV3) {
    const [policy, envelope, catalog] = await Promise.all([
      this.control.getPolicy(),
      this.dsa.effectiveControlPolicyV3(),
      this.dsa.marketRouteCatalogV3(),
    ]);
    if (policy.syncState !== 'applied' || policy.effectiveStale !== false) {
      throw new Error('当前路由未应用');
    }
    const desired = desiredProviderPolicyV3Schema.parse({
      contractVersion: policy.contractVersion,
      consumer: policy.consumer,
      requestId: policy.requestId,
      revision: policy.revision,
      enabled: policy.enabled,
      routes: policy.routes,
    });
    const parsed = marketRouteContextV3({
      desired,
      effective: envelope.projection?.effective,
      catalog,
      routeKey,
    });
    if (!parsed.ok) throw new Error('当前精确路由上下文不可用');
    const context = parsed.context;
    return {
      desiredRevision: context.desiredRevision,
      effectiveRevision: context.effectivePolicyRevision,
      catalogRevision: context.catalogRevision,
      targetSources: context.targets.map(({ target, routeIndex }) => ({ ...target, routeIndex })),
      availability: context.targets.map(({ eligible, catalogReady }) => ({
        eligible,
        catalogReady,
      })),
    };
  }

  async readCurrent(routeKey: MarketDataBarRouteKeyV3) {
    const before = await this.capture(routeKey);
    const after = await this.capture(routeKey);
    if (!isDeepStrictEqual(before, after)) throw new Error('读取期间路由修订变化');
    if (!after.availability.some((target) => target.eligible && target.catalogReady)) {
      throw new Error('当前路由没有就绪目标');
    }
    return after;
  }
}
