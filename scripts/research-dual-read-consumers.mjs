import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { ThesisLedgerApiClient, retryAfterMilliseconds } from '../packages/api-client/dist/index.js';

export async function verifyConsumerReads(baseUrl, fixtures, existingRuns) {
  assert.equal(new URL(baseUrl).hostname, '127.0.0.1');
  let requests = 0, assertions = 0, rateLimitResponses = 0;
  const sdk = new ThesisLedgerApiClient(baseUrl + '/', async (input, init) => {
    assert.equal(init?.method ?? 'GET', 'GET');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      requests += 1;
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
      if (response.status !== 429 || attempt === 2) return response;
      const wait = retryAfterMilliseconds(response.headers.get('retry-after'));
      assert(wait !== null && wait >= 0 && wait <= 60_000, '服务端限流等待超出受控读取预算');
      rateLimitResponses += 1; await response.arrayBuffer();
      console.log(`阶段：既有结果读取触发限流，按服务端 Retry-After 等待 ${Math.ceil(wait / 1000)} 秒`);
      await setTimeout(wait + 100);
    }
    throw new Error('读取超过有界重试次数');
  });
  for (const item of Object.values(fixtures.cases)) {
    const scope = { accountId: item.accountId, mode: item.mode };
    const read = item.kind === 'single' ? sdk.journalReviews.explanation.bind(sdk.journalReviews)
      : sdk.journalReviews.periodExplanation.bind(sdk.journalReviews);
    const response = await read(item.id, scope);
    assert.deepEqual(response.result, item.result); assertions += 1;
    await assert.rejects(() => read(item.id, { ...scope, mode: 'shadow' }), error => error.status === 404);
    assertions += 1;
  }
  const history = await sdk.research.list({ view: 'legacy' });
  const ids = new Set(history.items.map(row => row.id));
  assert(fixtures.runs.every(row => !ids.has(row.id)), '复盘任务混入通用研究历史'); assertions += 1;
  for (const item of existingRuns) {
    const run = await sdk.backtests.getRun(item.id);
    assert.equal(run.status, 'succeeded');
    try { assert.deepEqual(run.result, item.result); }
    catch { throw new Error('现有策略保存结果与恢复副本不一致；业务正文未回显'); }
    assertions += 2;
  }
  return { format: 'research-dual-read-consumers-v1', requests, assertions, rateLimitResponses,
    journalV1PositiveReads: 2, journalV2HiddenReads: 2, crossModeRejections: 4,
    journalExcludedFromResearchHistory: true, existingStrategyResultsRead: existingRuns.length };
}
