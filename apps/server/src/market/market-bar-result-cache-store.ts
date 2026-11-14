import { createHash } from 'node:crypto';
import { omit } from 'es-toolkit';
import { z } from 'zod';
import {
  marketChartBarsRequestResponseV3Schema,
  type MarketChartBarsRequestV3, type MarketChartBarsResponseV3,
} from '@thesis-ledger/schemas';
import { redisKey, type RedisService } from '../platform/redis.service.js';
import { withMarketRequestDeadline } from './market-request-coordinator.js';

export const BAR_RESULT_FRESH_MS = 60_000;
export const BAR_CACHE_COMMAND_MS = 500;
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cacheEnvelopeSchema = z.strictObject({ version: z.literal(1), expiresAt: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/), body: z.record(z.string(), z.unknown()) });
export const barResultCacheKey = (request: MarketChartBarsRequestV3, generation: string, revision: number, limit: number) =>
  `market-base-bar-v1:${fingerprint([request.purpose, request.symbol,
    [request.routeKey.kind, request.routeKey.market, request.routeKey.assetType, request.routeKey.capability,
      request.routeKey.timeframe, request.routeKey.adjustment],
    [request.routeTarget.providerId, request.routeTarget.upstreamSource, request.routeTarget.routeIndex],
    request.start, request.end, limit, generation, revision])}`;

/** 只保存校验成功的载荷；绝对到期时间及写入票据防止转存续期和晚到覆盖。 */
export class MarketBarResultCacheStore {
  constructor(private readonly redis: RedisService) {}

  async read(key: string, request: MarketChartBarsRequestV3, revision: number) {
    try {
      const raw = await withMarketRequestDeadline(() => this.redis.client.get(redisKey('cache', key)), BAR_CACHE_COMMAND_MS);
      if (!raw) return null;
      const envelope = cacheEnvelopeSchema.parse(JSON.parse(raw) as unknown);
      if (envelope.version !== 1 || typeof envelope.expiresAt !== 'number'
        || envelope.expiresAt <= Date.now() || envelope.expiresAt > Date.now() + BAR_RESULT_FRESH_MS
        || envelope.checksum !== fingerprint([envelope.expiresAt, envelope.body])) return null;
      const response = marketChartBarsRequestResponseV3Schema.parse({
        request, response: { ...envelope.body, requestId: request.requestId },
      }).response;
      if (response.provenance.effectivePolicyRevision !== revision
        || envelope.expiresAt !== Date.parse(response.sourcePriceBasis.observedAt) + BAR_RESULT_FRESH_MS
        || !response.bars.length) return null;
      return { response, freshUntil: new Date(envelope.expiresAt).toISOString(), cached: true };
    } catch {
      return null;
    }
  }

  async begin(key: string, ticket: string, leaseMs: number) {
    try {
      await withMarketRequestDeadline(() => this.redis.client.set(redisKey('cache', `${key}:writing`), ticket, 'PX', leaseMs),
        BAR_CACHE_COMMAND_MS);
      return true;
    } catch {
      return false;
    }
  }

  async publish(key: string, ticket: string, response: MarketChartBarsResponseV3) {
    const observedAt = Date.parse(response.sourcePriceBasis.observedAt);
    const expiresAt = observedAt + BAR_RESULT_FRESH_MS;
    const ttlMs = Math.floor(expiresAt - Date.now());
    if (observedAt > Date.now() || ttlMs <= 0 || !response.bars.length) return;
    const body = omit(response, ['requestId']);
    const raw = JSON.stringify({ version: 1, expiresAt, body, checksum: fingerprint([expiresAt, body]) });
    try {
      await withMarketRequestDeadline(() => this.redis.client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then redis.call("set", KEYS[2], ARGV[2], "PX", ARGV[3]); return 1 end return 0',
        2, redisKey('cache', `${key}:writing`), redisKey('cache', key), ticket, raw, String(ttlMs),
      ), BAR_CACHE_COMMAND_MS);
    } catch {
      // 有效行情可返回；失败写入不产生本地TTL或历史成功值回退。
    }
  }
}
