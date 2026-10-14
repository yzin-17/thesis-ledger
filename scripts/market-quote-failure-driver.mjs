import assert from 'node:assert/strict';
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { MarketQuoteReader } from '/app/apps/server/dist/src/market/market-quote-reader.js';
import { RedisService, redisKey } from '/app/apps/server/dist/src/platform/redis.service.js';
import { runWithTrace } from '/app/apps/server/dist/src/platform/structured-logger.js';
// 宿主将受测同文件模块拼入独立进程；不修改目标文件或应用服务。

let text = ''; for await (const chunk of process.stdin) text += chunk;
const request = JSON.parse(text);
assert(request.symbol === '600519.SH' && typeof request.traceId === 'string');
const redis = new RedisService(), client = new DsaClient(), reader = new MarketQuoteReader(client, redis);
const contextRequest = () => ({ contractVersion: 3, consumer: 'thesis-ledger', requestId: crypto.randomUUID(),
  capability: 'REALTIME_QUOTE', symbol: request.symbol });
const stable = (value) => { const copy = structuredClone(value); delete copy.requestId; return copy; };
const originalFetch = globalThis.fetch, proof = { injected: 0 };
try {
  const before = await client.marketCacheContextV3(contextRequest());
  assert(before.ready, '原报价必须当前可用');
  const key = redisKey('cache', `quote:4:${request.symbol}:inferred:${before.generation}:last-valid`);
  const previous = JSON.parse(await redis.client.get(key));
  assert(previous?.symbol === request.symbol && previous.provider === 'hithink', '须已存在本代次实际缓存基线');
  let value;
  await runWithTrace(request.traceId, async () => {
    globalThis.fetch = quoteFaultFetch(originalFetch, proof);
    try { value = await reader.getQuote(request.symbol, { refresh: true }); }
    finally { globalThis.fetch = originalFetch; }
  });
  assert.equal(proof.injected, 1, '必须恰好一次原报价GET失败');
  assert(value.servedFromCache === true && value.provider === previous.provider &&
    value.price === previous.price && value.marketTime === previous.marketTime && value.fetchedAt === previous.fetchedAt,
    '同代次有效缓存不伪造来源/价格/日期');
  assert.deepEqual(stable(await client.marketCacheContextV3(contextRequest())), stable(before));
  console.log('QUOTE_FAILURE_PROOF=' + JSON.stringify({ traceId: request.traceId, generation: before.generation,
    injected: proof.injected, quoteHttpAttempts: proof.injected, sourceSdkExecutions: 0,
    cached: true, provider: value.provider, freshness: value.freshness, stale: value.stale,
    fetchedAt: value.fetchedAt, marketTime: value.marketTime, controlUnchanged: true }));
} finally { globalThis.fetch = originalFetch; await redis.onModuleDestroy(); }
