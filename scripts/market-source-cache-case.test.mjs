import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceCacheCase, executeSourceCacheCase } from './market-source-cache-case.mjs';
import { cacheRouteKey } from './market-cache-generation-case.mjs';

function fixture() {
  const policy = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'base', revision: 97,
    enabled: true, syncState: 'applied', effectiveStale: false, dsaRevision: 97,
    routes: [{ key: cacheRouteKey, targets: [{ providerId: 'hithink', upstreamSource: 'a-share-prices-snapshot' }] }] };
  const source = { providerId: 'hithink', enabled: true, credentialConfigured: true, configVersion: 5 };
  const writes = [], records = [];
  const api = { get: async (p) => structuredClone(p.endsWith('/providers') ? { providers: [source] } : policy),
    post: async (p, body) => { assert.equal(p, '/api/market-data/providers/hithink/config');
      assert.equal(body.expectedConfigVersion, source.configVersion);
      writes.push(body); source.enabled = body.enabled; source.configVersion += 1;
      return { ...body, configVersion: source.configVersion }; } };
  return { api, source, policy, writes, records, plan: createSourceCacheCase(policy, [source]),
    journal: async (r) => records.push(r), probe: async (p) => p === 'disabled'
      ? { rejected: true, dataCalls: 0 }
      : { provider: 'hithink', firstCached: false, secondCached: true, dataCalls: 1 } };
}
test('仅enabled CAS 5→6→7，恢复后新配置代次获取/缓存；政策和凭据不写', async () => {
  const h = fixture(); await executeSourceCacheCase(h.api, h.plan, h.journal, h.probe);
  assert.deepEqual(h.writes.map((r) => Object.keys(r).sort()), Array(2).fill(['enabled', 'expectedConfigVersion', 'requestId']));
  assert.equal(h.source.configVersion, 7); assert.equal(h.source.enabled, true);
  assert.equal(h.policy.revision, 97); assert.equal(h.records.at(-1).owned, false);
});
test('关闭验收失败恢复；未知提交不覆盖；并行政策阻止恢复', async () => {
  const h = fixture(); await assert.rejects(executeSourceCacheCase(h.api, h.plan, h.journal, async (p) => {
    if (p === 'disabled') throw new Error('读取失败'); return h.probe(p);
  }), /读取失败/); assert.equal(h.source.enabled, true);
  const u = fixture(), post = u.api.post;
  u.api.post = async (...args) => { await post(...args); throw new Error('响应丢失'); };
  await assert.rejects(executeSourceCacheCase(u.api, u.plan, u.journal, u.probe), /响应丢失/);
  assert.equal(u.writes.length, 1); assert.equal(u.records.at(-1).owned, false);
  const c = fixture(); await assert.rejects(executeSourceCacheCase(c.api, c.plan, c.journal, async (p) => {
    if (p === 'disabled') c.policy.revision += 1; return c.probe(p);
  }), /政策并行变化/); assert.equal(c.writes.length, 1); assert.equal(c.records.at(-1).owned, true);
});
