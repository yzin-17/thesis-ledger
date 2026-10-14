import { indicatorCalculateResponseSchema } from '@thesis-ledger/schemas';
import { type RedisService, redisKey } from '../platform/redis.service.js';

type IndicatorResponse = ReturnType<typeof indicatorCalculateResponseSchema.parse>;
type CachedIndicator = { expiresAt: number; response: IndicatorResponse };

export const indicatorRequestKey = (request: {
  name: string;
  parameters: Record<string, number>;
}) =>
  `${request.name}:${JSON.stringify(Object.entries(request.parameters).sort(([left], [right]) => left.localeCompare(right)))}`;

export class MarketIndicatorCache {
  private readonly memory = new Map<string, CachedIndicator>();
  constructor(
    private readonly redis?: RedisService,
    private readonly maxEntries = Number.POSITIVE_INFINITY,
  ) {}

  async get(key: string): Promise<IndicatorResponse | null> {
    const local = this.memory.get(key);
    if (local) {
      if (local.expiresAt > Date.now()) return local.response;
      this.memory.delete(key);
    }
    const client = this.redis?.client;
    if (!client?.get) return null;
    try {
      const raw = await client.get(redisKey('cache', `market-indicators-v3:${key}`));
      return raw ? indicatorCalculateResponseSchema.parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, response: IndicatorResponse, expiresAt: number) {
    if (expiresAt <= Date.now()) return;
    this.memory.set(key, { response, expiresAt });
    if (this.memory.size > this.maxEntries) {
      const first = this.memory.keys().next().value;
      if (first) this.memory.delete(first);
    }
    const client = this.redis?.client;
    if (!client?.set) return;
    try {
      const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      await client.set(
        redisKey('cache', `market-indicators-v3:${key}`),
        JSON.stringify(response),
        'EX',
        ttl,
      );
    } catch {
      /* Redis 写失败不影响已完成的纯计算结果。 */
    }
  }
}
