import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyDefaultLifecycle } from './ai-default-lifecycle-target.mjs';

function fixture() {
  const before = {
    provider: {
      id: 'owned',
      name: 'lmstudio',
      type: 'ai',
      enabled: true,
      updatedAt: '2026-10-21T00:00:00Z',
      settings: { models: ['model'] },
      credentialCipherHash: 'key',
    },
    fullConfigHash: 'config-before',
    otherConfigHash: 'other',
    routingHash: 'routing-before',
    routing: {
      id: 'global',
      revision: 2,
      researchDefaultProvider: 'lmstudio',
      researchDefaultModel: 'model',
      updatedAt: '2026-10-21T00:00:00Z',
      createdAt: 'old',
    },
    target: {
      state: {
        protection: {
          tables: {
            ProviderConfig: 'config-before',
            AiRoutingSettings: 'routing-before',
            Account: 'accounts',
          },
        },
        counters: { calls: 0 },
      },
    },
  };
  const cleared = structuredClone(before);
  cleared.provider.updatedAt = '2026-10-21T00:00:01Z';
  cleared.routing = {
    ...cleared.routing,
    revision: 3,
    researchDefaultProvider: null,
    researchDefaultModel: null,
    updatedAt: '2026-10-21T00:00:01Z',
  };
  cleared.fullConfigHash = 'config-after';
  cleared.routingHash = 'routing-clear';
  cleared.target.state.protection.tables.ProviderConfig = cleared.fullConfigHash;
  cleared.target.state.protection.tables.AiRoutingSettings = cleared.routingHash;
  return { plan: { before }, cleared };
}
test('拒绝零写、原子清除与精确恢复分别检查，只有元数据正常推进', () => {
  const { plan, cleared } = fixture();
  verifyDefaultLifecycle(plan, plan.before, 'unchanged');
  verifyDefaultLifecycle(plan, cleared, 'cleared');
  const restored = structuredClone(cleared);
  restored.routing = { ...plan.before.routing, revision: 4, updatedAt: '2026-10-21T00:00:02Z' };
  restored.routingHash = 'routing-restored';
  restored.target.state.protection.tables.AiRoutingSettings = restored.routingHash;
  verifyDefaultLifecycle(plan, restored, 'restored');
});
for (const [name, mutate] of [
  [
    '停用原提供方',
    (row) => {
      row.provider.enabled = false;
    },
  ],
  [
    '凭证变化',
    (row) => {
      row.provider.credentialCipherHash = 'changed';
    },
  ],
  [
    '专属设置变化',
    (row) => {
      row.provider.settings.models.push('other');
    },
  ],
  [
    '其他配置变化',
    (row) => {
      row.otherConfigHash = 'changed';
    },
  ],
  [
    '未绑定配置摘要',
    (row) => {
      row.fullConfigHash = 'stale';
    },
  ],
  [
    '未绑定默认摘要',
    (row) => {
      row.routingHash = 'stale';
    },
  ],
  [
    '残留模型引用',
    (row) => {
      row.routing.researchDefaultModel = 'model';
    },
  ],
  [
    '超出版本变化',
    (row) => {
      row.routing.revision = 4;
    },
  ],
  [
    '旧时间',
    (row) => {
      row.provider.updatedAt = '2026-10-21T00:00:00Z';
    },
  ],
  [
    '业务变化',
    (row) => {
      row.target.state.protection.tables.Account = 'changed';
    },
  ],
  [
    '模型调用',
    (row) => {
      row.target.state.counters.calls = 1;
    },
  ],
])
  test(`拒绝${name}`, () => {
    const { plan, cleared } = fixture();
    mutate(cleared);
    assert.throws(() => verifyDefaultLifecycle(plan, cleared, 'cleared'));
  });
