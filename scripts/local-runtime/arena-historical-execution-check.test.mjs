import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptedDecision, allowHistoricalFetch } from './arena-historical-execution-check.mjs';

test('仅复用已确认正常停止且身份通过的原决策，不接纳截断及工具回复', () => {
  const receipt = {
    mode: 'send',
    realModelCalls: 1,
    automaticRetries: 0,
    identity: { accepted: true },
    result: { rawFinishReason: 'stop', output: { action: 'decision', decision: { orders: [] } } },
    providerUnchanged: true,
    businessUnchanged: true,
  };
  assert.deepEqual(acceptedDecision(receipt), { orders: [] });
  for (const mutate of [
    (r) => (r.result.rawFinishReason = 'length'),
    (r) => (r.result.output.action = 'tools'),
    (r) => (r.identity.accepted = false),
    (r) => (r.businessUnchanged = false),
  ]) {
    const copy = structuredClone(receipt);
    mutate(copy);
    assert.throws(() => acceptedDecision(copy));
  }
});

test('真实资料验收拒绝模型地址、模型路径及重定向到其他来源', () => {
  const origin = 'http://dsa:8000';
  allowHistoricalFetch(origin + '/api/v1/thesis-ledger/arena/history/execution', origin);
  for (const url of [
    'http://192.168.5.20:6789/v1/chat/completions',
    origin + '/api/chat/completions',
    'http://dsa:8000.evil.test/api/data',
    origin + '/generate',
  ]) {
    assert.throws(() => allowHistoricalFetch(url, origin));
  }
});
