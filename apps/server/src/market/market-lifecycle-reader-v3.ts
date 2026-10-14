import { Inject, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  marketTradingStatusResponseV3Schema,
  type MarketTradingStatusResponseV3,
  type StatusCompositionDemandV1,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { readMarketStatusCompositionV1 } from './market-status-composition-reader-v1.js';

export type LifecycleReadScopeV3 = { market: 'CN'; symbol: string; start: string; end: string };
export interface MarketLifecycleReadPortV3 {
  read(scope: LifecycleReadScopeV3): Promise<MarketTradingStatusResponseV3>;
}

/** Market 只按现行标准能力和有效路由读取，不解释供应商字段。 */
@Injectable()
export class MarketLifecycleReaderV3 implements MarketLifecycleReadPortV3 {
  constructor(
    @Inject(DsaClient)
    private readonly dsa: Pick<DsaClient, 'effectiveControlPolicyV3' | 'marketTradingStatusV3' | 'dataCapabilities'>,
  ) {}
  readComposition(demands: readonly StatusCompositionDemandV1[]) {
    return readMarketStatusCompositionV1(demands, this.dsa.dataCapabilities,
      () => this.dsa.effectiveControlPolicyV3().then((result) => result.projection?.effective ?? null));
  }
  async read(scope: LifecycleReadScopeV3) {
    const policy = (await this.dsa.effectiveControlPolicyV3()).projection?.effective;
    const route = policy?.routes.find(
      (item) =>
        item.key.kind === 'data' &&
        item.key.market === scope.market &&
        item.key.assetType === 'STOCK' &&
        item.key.capability === 'HISTORICAL_TRADING_STATUS',
    );
    if (!policy?.enabled || !route) throw new Error('基础生命周期状态路由不可用');
    for (const target of route.targets) {
      if (!target.eligible) continue;
      let response: MarketTradingStatusResponseV3;
      try {
        response = marketTradingStatusResponseV3Schema.parse(
          await this.dsa.marketTradingStatusV3({
            contractVersion: 3,
            consumer: 'thesis-ledger',
            requestId: crypto.randomUUID(),
            routeKey: route.key,
            routeTarget: {
              providerId: target.providerId,
              upstreamSource: target.upstreamSource,
              routeIndex: target.routeIndex,
            },
            symbol: scope.symbol,
            range: { start: scope.start, end: scope.end },
          }),
        );
      } catch {
        continue;
      }
      const after = (await this.dsa.effectiveControlPolicyV3()).projection?.effective;
      const afterRoute = after?.routes.find(item => isDeepStrictEqual(item.key, route.key));
      if (!isDeepStrictEqual({ revision: policy.revision, sourceDesiredRevision: policy.sourceDesiredRevision, enabled: policy.enabled, route }, { revision: after?.revision, sourceDesiredRevision: after?.sourceDesiredRevision, enabled: after?.enabled, route: afterRoute })) throw new Error('生命周期读取期间有效路由变化');
      if (
        response.symbol !== scope.symbol ||
        response.range.start !== scope.start ||
        response.range.end !== scope.end ||
        response.provenance.providerId !== target.providerId ||
        response.provenance.upstreamSource !== target.upstreamSource
      )
        throw new Error('生命周期响应与请求来源不符');
      return response;
    }
    throw new Error('已配置生命周期来源未取得本次窗口');
  }
}
