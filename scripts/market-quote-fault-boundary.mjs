import assert from 'node:assert/strict';

/** 仅隔离进程的一次精确GET失败；其他请求保留原参数/认证/行为。 */
export function quoteFaultFetch(original, proof) {
  return async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v3/thesis-ledger/market/quote' &&
      url.searchParams.get('symbol') === '600519.SH' && (options?.method ?? 'GET') === 'GET') {
      proof.injected += 1;
      assert.equal(proof.injected, 1, '原报价显式一次GET，不允许重复故障/重试');
      return new Response(JSON.stringify({ detail: { code: 'upstream_unavailable',
        message: '隔离验收的一次报价HTTP失败' } }), { status: 503,
        headers: { 'content-type': 'application/json' } });
    }
    return original(input, options);
  };
}
