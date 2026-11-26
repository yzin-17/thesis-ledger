import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { marketChartBarsResponseV3Schema, type MarketChartBarsRequestV3 } from '@thesis-ledger/schemas';
import { MarketChartResultCache } from '../../src/market/market-chart-result-cache.js';

export const request: MarketChartBarsRequestV3 = {
  contractVersion: 1, purpose: 'interactive-chart', requestId: 'first', symbol: 'AAPL.US',
  routeKey: { kind: 'bar', market: 'US', assetType: 'STOCK', capability: 'MINUTE_BAR', timeframe: '1m', adjustment: 'none' },
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
  start: '2026-11-11', end: '2026-11-11',
};
const base = JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json', import.meta.url), 'utf8'));
export const catalogBase = JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/market-route-catalog-v3.complete.json', import.meta.url), 'utf8'));

export function response(input = request, close = 1.021, observed = Date.now()) {
  const observedAt = new Date(observed).toISOString();
  const minute = input.routeKey.timeframe !== '1d';
  const stamp = minute ? new Date(Math.floor(observed / 60_000) * 60_000).toISOString() : `${input.end}T12:00:00.000Z`;
  return marketChartBarsResponseV3Schema.parse({
    contractVersion: 1, purpose: input.purpose, requestId: input.requestId, symbol: input.symbol, routeKey: input.routeKey,
    bars: [{ ...base.bars[0], close, timestamp: stamp, completionStatus: minute ? 'incomplete' : 'unknown', availableAt: observedAt }],
    coverage: { requestedStart: input.start, requestedEnd: input.end, actualStart: stamp, actualEnd: stamp,
      hasMoreBefore: false, latestCompleteTradingDate: null },
    sourcePriceBasis: { ...base.sourcePriceBasis, adjustment: input.routeKey.adjustment,
      methodVersion: 'controlled-minute-v1', observedAt },
    provenance: { ...input.routeTarget, effectivePolicyRevision: 1 },
    inputFingerprint: base.inputFingerprint, ...(minute ? { session: 'regular', timestampConvention: 'interval-start' } : {}),
  });
}

/** Redis命令的受控接缝；实际Redis语义由独立集成验收负责。 */
export class CacheRedisFixture {
  readonly rows = new Map<string, { value: string; expiresAt: number }>();
  fail = false;
  get = vi.fn(async (key: string) => {
    if (this.fail) throw new Error('redis unavailable');
    const item = this.rows.get(key);
    if (!item || item.expiresAt <= Date.now()) { this.rows.delete(key); return null; }
    return item.value;
  });
  set = vi.fn(async (key: string, value: string, mode: string, ttl: number, nx?: string) => {
    if (this.fail) throw new Error('redis unavailable');
    const existing = this.rows.get(key);
    if (nx === 'NX' && existing && existing.expiresAt > Date.now()) return null;
    this.rows.set(key, { value, expiresAt: Date.now() + (mode === 'PX' ? ttl : ttl * 1000) });
    return 'OK';
  });
  eval = vi.fn(async (_script: string, count: number, ...args: string[]) => {
    if (this.fail) throw new Error('redis unavailable');
    if (count === 1) {
      if (await this.get(args[0]!) === args[1]) this.rows.delete(args[0]!);
      return 1;
    }
    if (await this.get(args[0]!) !== args[2]) return 0;
    await this.set(args[1]!, args[3]!, 'PX', Number(args[4]));
    return 1;
  });
}

export function setup(redis = new CacheRedisFixture()) {
  const state = { generation: 'a'.repeat(64), ready: true, revision: 1 };
  const dsa = { timeoutMs: 5000, marketCacheContextV3: vi.fn(async (input: Record<string, unknown>) => ({
    ...input, generation: state.generation, policyRevision: state.revision,
    ready: state.ready, reason: state.ready ? null : 'disabled',
  })) };
  const sessions = { read: vi.fn(async () => ({ state: 'open', date: '2026-11-11' })) };
  const cache = new MarketChartResultCache(dsa as never, { client: redis } as never, sessions as never);
  const load = vi.fn(async (input: MarketChartBarsRequestV3) => response(input));
  const read = (input = request, options: { limit?: number; refresh?: boolean; signal?: AbortSignal } = {}) =>
    cache.resolve(input, { limit: 90, ...options }, () => load(input));
  return { cache, redis, state, dsa, sessions, load, read };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
