import assert from 'node:assert/strict';
import { test } from 'node:test';
import { responseRequests } from './market-composition-response-acceptance.mjs';

test('响应观察固定五能力/原证券窗口/本政策，各参数仅属于本能力', () => {
  const requests = responseRequests({ temporary: { revision: 108 } });
  assert.equal(new Set(requests.map((r) => r.requestId)).size, 5);
  for (const request of requests) {
    assert.equal(request.symbol, '600519.SH'); assert.equal(request.policyRevision, 108);
    if (request.routeKey.capability === 'SECURITY_BASIC_DATES') assert(!('range' in request));
    else assert.deepEqual(request.range, { start: '2026-10-08', end: '2026-10-09' });
    if (request.routeKey.capability === 'RISK_WARNING') assert.deepEqual(request.detail.categories, ['delisting', 'other']);
    else assert(!('detail' in request));
    if (request.routeKey.capability === 'DAILY_PRICE_RULE') assert.equal(request.representation, 'rule');
    else assert(!('representation' in request));
  }
});
