import { Injectable } from '@nestjs/common';
import { tradingMarketForAssetMarket } from '@thesis-ledger/domain';
import {
  correlateBackgroundQuotePlan,
  type BackgroundQuotePlan,
  type QuoteAssetType,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { MarketService } from './market.service.js';

export type BackgroundQuoteDemand = { symbol: string; assetType?: QuoteAssetType };
export const backgroundQuoteStatusKey = redisKey('cache', 'market-background-quotes');

@Injectable()
export class MarketBackgroundQuotesService {
  private readonly plans = new Map<string, { checked: number; value: BackgroundQuotePlan }>();
  constructor(
    private readonly dsa: DsaClient,
    private readonly redis: RedisService,
    private readonly market: MarketService,
  ) {}

  private async plan(demand: BackgroundQuoteDemand, now: Date) {
    const key = `${demand.symbol}:${demand.assetType}`;
    const old = this.plans.get(key);
    if (old && now.getTime() - old.checked < 60_000) return old.value;
    const request = {
      contractVersion: 1 as const,
      consumer: 'thesis-ledger' as const,
      requestId: crypto.randomUUID(),
      symbol: demand.symbol,
      assetType: demand.assetType!,
    };
    const raw = await this.dsa.post(
      '/api/v1/thesis-ledger/market/background-quote/plan',
      request,
      1,
    );
    const value = correlateBackgroundQuotePlan(request, raw);
    this.plans.set(key, { checked: now.getTime(), value });
    return value;
  }

  async reconcile(demands: BackgroundQuoteDemand[], now = new Date()) {
    const wanted = new Set(demands.map((d) => `${d.symbol}:${d.assetType}`));
    for (const key of this.plans.keys()) if (!wanted.has(key)) this.plans.delete(key);
    const statuses = [];
    for (const demand of demands) {
      const row = await this.acquire(demand, now);
      const last = await this.redis.client.get(
        redisKey('cache', `background-quote-attempt:${row.provider}:${demand.symbol}:last`),
      );
      if (last && !row.sourceTime) Object.assign(row, JSON.parse(last));
      statuses.push(row);
    }
    // One replace removes disabled/archived demand; previous status expires if this process dies.
    await this.redis.client.set(
      backgroundQuoteStatusKey,
      JSON.stringify({ checkedAt: now.toISOString(), sources: statuses }),
      'EX',
      120,
    );
    return statuses;
  }

  private async acquire(demand: BackgroundQuoteDemand, now: Date) {
    const row = {
      symbol: demand.symbol,
      assetType: demand.assetType ?? 'UNKNOWN',
      acquisition: 'blocked',
      reason: 'identity_unverified',
      provider: null as string | null,
      minIntervalSeconds: null as number | null,
      sourceUpdateIntervalSeconds: null,
      sourceTime: null as string | null,
      fetchedAt: null as string | null,
      nextAttemptAt: null as string | null,
    };
    if (!demand.assetType) {
      if (demand.symbol.endsWith('.OF')) row.reason = 'official_nav_updates_required';
      return row;
    }
    try {
      const plan = await this.plan(demand, now);
      row.provider = plan.target?.providerId ?? null;
      row.reason = plan.reason ?? '';
      row.acquisition = plan.acquisition;
      row.minIntervalSeconds = plan.minIntervalSeconds;
      if (plan.acquisition === 'blocked') return row;
      const tradingMarket = tradingMarketForAssetMarket(demand.symbol.split('.').at(-1) ?? '');
      if (!tradingMarket) return row;
      const session = await this.market.getSession(tradingMarket, now);
      if (session.state !== 'open') {
        row.reason = session.state === 'unknown' ? 'calendar_unavailable' : 'outside_market_session';
        return row;
      }
      const window = redisKey(
        'cache',
        `background-quote-attempt:${plan.target!.providerId}:${demand.symbol}`,
      );
      // Reserve before any data call; neither process failure nor rule/route edits reset it.
      const interval = plan.minIntervalSeconds! * 1000;
      const next = now.getTime() + interval;
      if ((await this.redis.client.set(window, String(next), 'PX', interval, 'NX')) !== 'OK') {
        const until = Number(await this.redis.client.get(window));
        if (Number.isFinite(until) && until > 0) row.nextAttemptAt = new Date(until).toISOString();
        row.reason = 'source_request_window';
        return row;
      }
      row.nextAttemptAt = new Date(next).toISOString();
      const quote = await this.market.getQuote(demand.symbol, {
        assetType: demand.assetType,
        allowStale: false,
        background: plan,
      });
      row.provider = quote.provider;
      row.sourceTime = quote.marketTime;
      row.fetchedAt = quote.fetchedAt;
      row.reason = quote.servedFromCache ? 'shared_quote_cache' : 'sample_observed';
      await this.redis.client.set(
        window + ':last',
        JSON.stringify({ sourceTime: row.sourceTime, fetchedAt: row.fetchedAt }),
        'EX',
        86_400,
      );
    } catch {
      this.plans.delete(`${demand.symbol}:${demand.assetType}`);
      row.reason = 'acquisition_unavailable';
    }
    return row;
  }
}
