import { Injectable } from '@nestjs/common';
import { TimeoutError } from 'es-toolkit';
import {
  marketChartBarsRequestResponseV3Schema,
  type MarketChartBarsRequestV3, type MarketChartBarsResponseV3,
} from '@thesis-ledger/schemas';
import { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
import { RedisService } from '../platform/redis.service.js';
import { MarketCacheControl } from './market-cache-control.js';
import { MarketRequestCoordinator, withMarketRequestDeadline } from './market-request-coordinator.js';
import { MarketSessionReader } from './market-session-reader.js';
import {
  BAR_CACHE_COMMAND_MS, BAR_RESULT_FRESH_MS, barResultCacheKey, MarketBarResultCacheStore,
} from './market-bar-result-cache-store.js';

type Result = { response: MarketChartBarsResponseV3; cached: boolean; freshUntil?: string };

/** 已知市场会话下复用精确股票/ETF交互成功值，所有窗口统一60秒短上限。 */
@Injectable()
export class MarketChartResultCache {
  private readonly control: MarketCacheControl;
  private readonly coordinator: MarketRequestCoordinator;
  private readonly store: MarketBarResultCacheStore;
  private readonly writing = new Map<string, string>();

  constructor(private readonly dsa: DsaClient, redis: RedisService, private readonly sessions: MarketSessionReader) {
    this.control = new MarketCacheControl(dsa);
    this.coordinator = new MarketRequestCoordinator(redis, () => dsa.timeoutMs, BAR_CACHE_COMMAND_MS);
    this.store = new MarketBarResultCacheStore(redis);
  }

  private supports(request: MarketChartBarsRequestV3) {
    const key = request.routeKey;
    if (!['CN', 'HK', 'US'].includes(key.market) || !['STOCK', 'ETF'].includes(key.assetType)
      || !['1m', '5m', '15m', '30m', '60m', '1d'].includes(key.timeframe)) return false;
    if (key.timeframe === '1d') return ['none', 'qfq', 'hfq'].includes(key.adjustment);
    return key.adjustment === 'none';
  }

  async resolve(request: MarketChartBarsRequestV3, options: { limit: number; refresh?: boolean; signal?: AbortSignal },
    load: () => Promise<MarketChartBarsResponseV3>): Promise<Result> {
    if (!this.supports(request)) return { response: await load(), cached: false };
    const configured = Number(this.dsa.timeoutMs);
    const budget = Number.isFinite(configured) && configured > 0 ? configured : 5000;
    const actor = new AbortController();
    try {
      return await withMarketRequestDeadline(() => this.withinBudget(request, options, load, actor.signal), budget);
    } catch (error) {
      if (error instanceof TimeoutError) {
        const timeout = new DsaError('K线缓存与来源读取超过原请求时限', 'timeout');
        actor.abort(timeout);
        throw timeout;
      }
      throw error;
    }
  }

  private async withinBudget(request: MarketChartBarsRequestV3,
    options: { limit: number; refresh?: boolean; signal?: AbortSignal },
    load: () => Promise<MarketChartBarsResponseV3>, actor: AbortSignal): Promise<Result> {
    const caller = options.signal ? AbortSignal.any([actor, options.signal]) : actor;
    const session = await this.sessions.read(request.routeKey.market);
    caller.throwIfAborted();
    if (session.state === 'unknown' || !session.date)
      return { response: await load(), cached: false };
    const { capability } = request.routeKey;
    let scope;
    try {
      scope = await this.control.read({ capability, symbol: request.symbol, purpose: 'interactive-chart',
        routeKey: request.routeKey, routeTarget: request.routeTarget, start: request.start, end: request.end }, caller);
    } catch (error) {
      if (error instanceof DsaError && (error.code === 'invalid-request'
        || error.code === 'unsupported-capability' || error.status === 404))
        return { response: await load(), cached: false };
      throw error;
    }
    const key = barResultCacheKey(request, scope.context.generation, scope.context.policyRevision, options.limit);
    if (!options.refresh) {
      const cached = await this.store.read(key, request, scope.context.policyRevision);
      if (cached) {
        await this.control.assertCurrent(scope, caller);
        return cached;
      }
    }
    const flightKey = `${key}:${options.refresh ? 'refresh' : 'ordinary'}`;
    const result = await this.coordinator.singleFlight(flightKey, () => this.coordinator.withDistributedLock(
      flightKey, async () => {
        actor.throwIfAborted();
        if (!options.refresh) {
          const cached = await this.store.read(key, request, scope.context.policyRevision);
          if (cached) return cached;
        }
        const ticket = crypto.randomUUID();
        this.writing.set(key, ticket);
        const mayPublish = await this.store.begin(key, ticket, this.coordinator.leaseMs);
        try {
          const response = marketChartBarsRequestResponseV3Schema.parse({ request, response: await load() }).response;
          if (response.provenance.effectivePolicyRevision !== scope.context.policyRevision)
            throw new DsaError('K线读取期间政策修订变化', 'stale-revision');
          await this.control.assertCurrent(scope, actor);
          if (mayPublish && this.writing.get(key) === ticket) await this.store.publish(key, ticket, response);
          return { response, cached: false,
            freshUntil: new Date(Date.parse(response.sourcePriceBasis.observedAt) + BAR_RESULT_FRESH_MS).toISOString() };
        } finally {
          if (this.writing.get(key) === ticket) this.writing.delete(key);
        }
      }, actor,
    ));
    await this.control.assertCurrent(scope, caller);
    // 合并请求只共用载荷，每个调用者保留自己的请求关联。
    return { ...result, response: marketChartBarsRequestResponseV3Schema.parse({
      request, response: { ...result.response, requestId: request.requestId },
    }).response };
  }
}
