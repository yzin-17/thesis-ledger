import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quoteFaultFetch } from './market-quote-fault-boundary.mjs';

test('只一次精确quote GET 503，其他证券/控制/POST保持原请求对象，不修改参数或认证', async () => {
  const seen = [], proof = { injected: 0 };
  const original = async (url, options) => { seen.push([url, options]); return new Response('{}'); };
  const fetch = quoteFaultFetch(original, proof);
  const options = { method: 'POST', headers: { authorization: 'fixture-token' }, body: '{}' };
  await fetch('http://local/api/v3/thesis-ledger/market/cache-context', options);
  await fetch('http://local/api/v3/thesis-ledger/market/quote?symbol=000001.SZ');
  await fetch('http://local/api/v3/thesis-ledger/market/quote?symbol=600519.SH', options);
  assert.equal(seen.length, 3); assert.equal(seen[0][1], options); assert.equal(seen[2][1], options);
  const url = 'http://local/api/v3/thesis-ledger/market/quote?symbol=600519.SH';
  assert.equal((await fetch(url)).status, 503); assert.equal(proof.injected, 1);
  await assert.rejects(fetch(url), /显式一次GET/);
  assert.equal(seen.length, 3);
});
