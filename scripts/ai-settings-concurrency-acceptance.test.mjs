import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyAiSettingsTransition } from './ai-settings-concurrency-acceptance.mjs';

const fixture = () => {
  const baseline = {
    state: {
      protection: {
        tables: { AiRoutingSettings: 'before', ProviderConfig: 'credentials', Account: 'facts' },
        runs: [{ id: 'retained' }],
      },
      counters: { runs: 0, tools: 0 },
    },
    extra: { retained: true },
    identity: { retained: true },
  };
  const row = {
    id: 'global',
    revision: 1,
    researchDefaultProvider: 'existing',
    researchDefaultModel: 'model',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const plan = { baseline, routing: { hash: 'before', rows: [row] } };
  const after = structuredClone(baseline);
  after.state.protection.tables.AiRoutingSettings = 'after';
  const routing = {
    hash: 'after',
    rows: [{ ...row, revision: 2, updatedAt: '2026-10-21T00:00:00Z' }],
  };
  return { plan, after, routing };
};

test('只接受单次成功的版本变化，其他字段、业务和凭据保持', () => {
  const { plan, after, routing } = fixture();
  assert.equal(verifyAiSettingsTransition(plan, after, routing).passed, true);
});

for (const [name, mutate] of [
  [
    '额外版本变化',
    (value) => {
      value.routing.rows[0].revision = 3;
    },
  ],
  [
    '默认引用变化',
    (value) => {
      value.routing.rows[0].researchDefaultModel = 'other';
    },
  ],
  [
    '创建时间变化',
    (value) => {
      value.routing.rows[0].createdAt = '2026-10-21T00:00:00Z';
    },
  ],
  [
    '旧业务变化',
    (value) => {
      value.after.state.protection.tables.Account = 'changed';
    },
  ],
  [
    '模型调用增加',
    (value) => {
      value.after.state.counters.runs = 1;
    },
  ],
  [
    '凭据或配置变化',
    (value) => {
      value.after.state.protection.tables.ProviderConfig = 'changed';
    },
  ],
  [
    '行与摘要不符',
    (value) => {
      value.routing.hash = 'unbound';
    },
  ],
  [
    '额外设置行',
    (value) => {
      value.routing.rows.push({ id: 'other' });
    },
  ],
  [
    '旧修订时间',
    (value) => {
      value.routing.rows[0].updatedAt = '2020-01-01T00:00:00Z';
    },
  ],
  [
    '修订时间未推进',
    (value) => {
      value.routing.rows[0].updatedAt = value.plan.routing.rows[0].updatedAt;
    },
  ],
]) {
  test(`拒绝${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => verifyAiSettingsTransition(value.plan, value.after, value.routing));
  });
}
