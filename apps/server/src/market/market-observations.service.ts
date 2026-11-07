import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { quoteSchema, fundNavSchema, fxRatesResponseSchema } from '@thesis-ledger/schemas';
import { RedisService, redisKey } from '../platform/redis.service.js';

export const marketObservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quote'), value: quoteSchema }),
  z.object({ kind: z.literal('nav'), value: fundNavSchema }),
  z.object({ kind: z.literal('fx'), value: fxRatesResponseSchema }),
]);
export type MarketObservation = z.infer<typeof marketObservationSchema>;
export const observationStream = redisKey('queue', 'market-observations');
const snapshotKey = redisKey('cache', 'market-observations');

// One atomic, bounded journal: old/duplicate source observations cannot replace
// newer data. Redis is a delivery/cache layer, never the business risk state.
const recordScript = `
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local previous = cjson.decode(old)
  if previous.sourceTime > ARGV[2] then return nil end
  if previous.sourceTime == ARGV[2] and previous.fetchedAt and previous.fetchedAt > ARGV[5] then return nil end
  if previous.fingerprint == ARGV[3] then return nil end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
redis.call('EXPIRE', KEYS[1], 86400)
return redis.call('XADD', KEYS[2], 'MAXLEN', '~', 10000, '*', 'observation', ARGV[4])
`;
export type ObservedMarketValue = {
  sourceTime: string;
  fingerprint: string;
  fetchedAt?: string;
  observation: MarketObservation;
};

@Injectable()
export class MarketObservationsService {
  private readonly logger = new Logger(MarketObservationsService.name);
  constructor(private readonly redis: RedisService) {}

  async record(input: MarketObservation) {
    const observation = marketObservationSchema.parse(input);
    const { value, kind } = observation;
    let sourceTime: string | null;
    let identity: string;
    if (kind === 'quote') {
      sourceTime = value.marketTime;
      identity = value.symbol;
    } else if (kind === 'nav') {
      sourceTime = value.navDate;
      identity = value.symbol;
    } else {
      sourceTime = value.fetchedAt;
      identity = `${value.baseCurrency}:${value.asOf}`;
    }
    if (!sourceTime || Date.parse(sourceTime) > Date.now()) return;
    sourceTime = new Date(sourceTime).toISOString();
    // Cache hits have the same economic identity. Re-reading them is not a tick.
    const stable = {
      ...value,
      fetchedAt: kind === 'quote' ? undefined : value.fetchedAt,
      servedFromCache: undefined,
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
    const fetchedAt = new Date(value.fetchedAt).toISOString();
    const stored = { sourceTime, fingerprint, fetchedAt, observation };
    try {
      await this.redis.client.eval(
        recordScript,
        2,
        snapshotKey,
        observationStream,
        `${kind}:${identity}`,
        sourceTime,
        fingerprint,
        JSON.stringify(stored),
        fetchedAt,
      );
    } catch {
      // Do not break an already successful market request. Monitoring reports a
      // gap and cannot promise replay while the observation journal is down.
      this.logger.warn('market_observation_journal_unavailable');
    }
  }

  async snapshots(): Promise<ObservedMarketValue[]> {
    const values = await this.redis.client.hvals(snapshotKey);
    return values.map((raw) => {
      const parsed = JSON.parse(raw) as ObservedMarketValue;
      return { ...parsed, observation: marketObservationSchema.parse(parsed.observation) };
    });
  }
}
