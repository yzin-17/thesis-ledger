import assert from 'node:assert/strict';
import { ThesisLedgerApiClient } from '../packages/api-client/dist/index.js';

/** 请求适配器必须连接真实 HTTP；本入口不提供结果替身，也不允许任何写请求。 */
export async function verifyDualReadSdk(baseUrl, fixtures) {
  assert.equal(new URL(baseUrl).hostname, '127.0.0.1');
  let requests = 0, assertions = 0;
  const check = (value, message) => { assert(value, message); assertions += 1; };
  const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions += 1; };
  const fetcher = async (input, init) => {
    assert.equal(init?.method ?? 'GET', 'GET');
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
    requests += 1;
    return response;
  };
  const client = new ThesisLedgerApiClient(baseUrl + '/', fetcher).research, c = fixtures.cases;
  const capability = await client.capabilities();
  equal(capability.canCreate, false);
  const legacy = await client.list({ view: 'legacy' });
  equal(legacy.items.map(row => row.id).sort(), [c.legacy.id, c.pending.id].sort());
  check(legacy.items.every(row => row.historicalScope.status === 'unrecorded'), '旧 context 不能升级为可信范围');
  for (const name of ['actual', 'shadow']) {
    const page = await client.list({ view: 'scoped', mode: name });
    const expected = name === 'actual' ? [c.actual.id] : [c.shadow.id, c.corrupt.id, c.foreignCall.id];
    equal(page.items.map(row => row.id).sort(), expected.sort());
    check(page.items.every(row => row.historicalScope.status === 'known'
      && row.historicalScope.snapshot.mode === name), '列表出现其他模式或旧历史');
  }
  for (const item of Object.values(c)) {
    const detail = await client.detail(item.id, item.locator);
    equal(detail.availability, item.expected);
    if (item.expected === 'available') equal(detail.result, item.result);
    if (item.expected === 'invalid') equal(detail.result, null);
  }
  for (const name of ['legacy', 'shadow', 'actual']) {
    const item = c[name], evidence = await client.evidence(item.id, item.referenceId, item.locator);
    equal(evidence.version, name === 'legacy' ? 1 : 2);
    if (evidence.version === 2) {
      equal(evidence.evidence.data.price, 100);
      equal(evidence.evidence.audit, item.result.evidenceBindings[0].audit);
    } else equal(evidence.toolCall.id, item.referenceId);
  }
  const rejected = [
    () => client.detail(c.shadow.id, { ...c.shadow.locator, mode: 'actual' }),
    () => client.detail(c.actual.id, { view: 'legacy' }),
    () => client.detail(c.legacy.id, c.actual.locator),
    () => client.detail(c.shadow.id, { ...c.shadow.locator,
      instrumentId: '75000000-0000-4000-8000-000000000999' }),
    () => client.evidence(c.actual.id, c.legacy.referenceId, c.actual.locator),
  ];
  for (const action of rejected) {
    await assert.rejects(action, error => error.status === 404);
    assertions += 1;
  }
  for (const name of ['corrupt', 'foreignCall']) {
    await assert.rejects(() => client.evidence(c[name].id, c[name].referenceId, c[name].locator),
      error => error.status === 404 || error.status === 400);
    assertions += 1;
  }
  return { format: 'research-dual-read-sdk-v1', requests, assertions,
    positiveReports: 3, rejectedReads: rejected.length + 2,
    scenarios: ['V1 及未核验历史', '实际/模拟 V2', '冻结引用', '材料损坏拒绝',
      '跨任务引用拒绝', '范围与模式隔离', '关闭创建能力'] };
}
