import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replayProgress, preservedMatch } from './arena-replay-watch.mjs';

const detail = () => ({ id: 'new', state: 'running', startedAt: 'now', protocol: {}, remaining: {},
  timeline: { phase: 'replay', status: 'research' }, frames: [], agents: [{ id: 'agent', state: 'researching',
    remaining: {}, account: { revision: 1, cash: '100000', positions: [], watchedSymbols: [], fills: [] }, cycles: [] }] });
test('截断优先于一般失败并立即产生停止条件', () => {
  const d = detail();
  d.agents[0].cycles.push({ state: 'failed', reason: 'model_output_invalid', usage: {
    calls: [{ state: 'settled', error: { code: 'output_truncated' } }] } });
  assert.equal(replayProgress(d).stopReason, 'output_truncated');
});
test('未知调用与来源阻塞均阻止继续运行', () => {
  const d = detail(); d.agents[0].cycles.push({ state: 'unknown_usage', reason: 'unknown_usage' });
  assert.equal(replayProgress(d).stopReason, 'unknown_usage');
  d.agents[0].cycles = []; d.timeline = { phase: 'replay', status: 'blocked', reason: 'replay_rules_unavailable' };
  assert.equal(replayProgress(d).stopReason, 'replay_rules_unavailable');
});
test('成功工具往返不触发停止，原账户或周期改变会改变保护摘要', () => {
  const d = detail(), before = preservedMatch(d);
  d.agents[0].cycles.push({ state: 'running', usage: { calls: [{ state: 'settled' }, { state: 'reserved' }] } });
  assert.equal(replayProgress(d).stopReason, null);
  assert.equal(replayProgress(d).calls, 2);
  assert.notDeepEqual(preservedMatch(d), before);
});
