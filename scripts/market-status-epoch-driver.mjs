import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import assert from 'node:assert/strict';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { stage, requests } = JSON.parse(input);
const client = new DsaClient();
const originalFetch = globalThis.fetch;
let mode = 'normal', injected = 0, dataCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith('/market/status-capabilities')) {
    dataCalls++;
    const request = JSON.parse(options.body);
    if (mode === 'fault' && request.routeKey.capability === 'DAILY_TRADING_STATUS' && request.routeTarget.providerId === 'baostock') {
      injected++;
      assert(injected === 1, '来源不应被重复重试');
      return new Response(JSON.stringify({ detail: { code: 'upstream_unavailable', message: '隔离验收的单次来源失败' } }),
        { status: 503, headers: { 'content-type': 'application/json' } });
    }
  }
  return originalFetch(url, options);
};
const proof = {};
try {
  if (stage === 1) {
    try { await client.dataCapabilities.routedStatusCapability(requests[0]); }
    catch (error) { proof.statusError = error.code; }
    proof.statusDataCalls = dataCalls;
    dataCalls = 0;
    proof.risk = await client.dataCapabilities.routedStatusCapability(requests[1]);
    proof.riskDataCalls = dataCalls;
  } else {
    [proof.status, proof.risk] = await Promise.all(requests.map((request) => client.dataCapabilities.routedStatusCapability(request)));
    proof.repeated = await client.dataCapabilities.routedStatusCapability({ ...requests[0], requestId: requests[0].requestId + ':repeat' });
    if (stage === 0) {
      mode = 'fault'; dataCalls = 0;
      proof.fallback = await client.dataCapabilities.routedStatusCapability({ ...requests[0], requestId: requests[0].requestId + ':fault' });
      proof.fallbackDataCalls = dataCalls;
      proof.injected = injected;
    }
  }
} catch (error) {
  const codes = ['timeout', 'unavailable', 'invalid-response', 'unauthorized', 'unsupported-capability',
    'insufficient-coverage', 'control-rejected', 'source-symbol-unrecognized', 'invalid-request',
    'permission-denied', 'source-authentication-failed', 'stale-revision'];
  console.log('EPOCH_FAILURE=' + JSON.stringify({ stage, dataCalls, injected,
    code: codes.includes(error.code) ? error.code : 'unknown' }));
  process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; }
if (!process.exitCode) console.log('EPOCH_RESULTS=' + JSON.stringify(proof));
