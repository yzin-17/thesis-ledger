import assert from 'node:assert/strict';
import { test } from 'node:test';
import { v6Candidate } from './run-arena-v6-deployment.mjs';

test('精确候选只迁移 Arena 合同，不改模型及路由参数，也不污染原对象', () => {
  const row = { name: 'lmstudio', updatedAt: '2026-11-17T00:00:00Z', enabled: true, priority: 7, capabilities: ['chat'],
    settings: { baseUrl: 'http://example.invalid/v1', models: ['kept'], authMode: 'none', upstreamFormat: 'chat-completions',
      modelDefaults: { kept: { temperature: 0.7, outputTokenLimit: 'upstream' } }, modelReasoning: { kept: { enabled: true } },
      modelPricing: { kept: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'CNY' } }, executionRoutes: [
        { model: 'kept', mode: 'native_schema', contract: { id: 'arena_live_research', version: 'arena-live-research-v5' },
          outputPolicy: 'manual', modeOverridden: true, reasoningEffort: 'high', firstOutputTimeoutMs: 123456 },
        { model: 'kept', mode: 'json_mode', contract: { id: 'other', version: 'same' } },
      ] } };
  const before = structuredClone(row), candidate = v6Candidate(row);
  const expected = structuredClone(row.settings.executionRoutes); expected[0].contract.version = 'arena-live-research-v6';
  assert.deepEqual(candidate.executionRoutes, expected);
  assert.deepEqual(candidate.modelDefaults, row.settings.modelDefaults);
  assert.deepEqual(candidate.modelReasoning, row.settings.modelReasoning);
  assert.deepEqual(candidate.models, row.settings.models);
  assert.deepEqual(row, before);
});
test('无目标、重复目标或已不是 v5 时停止，不扩展为其他配置迁移', () => {
  const route = { model: 'kept', contract: { id: 'arena_live_research', version: 'arena-live-research-v5' } };
  for (const executionRoutes of [[], [route, route], [{ ...route, contract: { ...route.contract, version: 'unknown' } }]])
    assert.throws(() => v6Candidate({ settings: { executionRoutes } }));
});
