import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  controlledConfigName,
  controlledConfigKeys,
  publicControlledInput,
  controlledHash,
  assertControlledOwned,
  verifyControlledStage,
  verifyControlledProtection,
} from './ai-controlled-config-contract.mjs';

function fixture() {
  const input = publicControlledInput();
  const settings = structuredClone(input);
  for (const key of ['name', 'priority', 'enabled', 'capabilities']) delete settings[key];
  const owned = {
    id: '96000000-0000-4000-8000-000000000001',
    name: controlledConfigName,
    type: 'ai',
    enabled: false,
    priority: 991,
    capabilities: ['chat'],
    settings,
    revision: '2026-10-21T00:00:00.000Z',
    credentialCipherHash: 'first-cipher',
    credentialPlainHash: controlledHash(controlledConfigKeys.first),
    health: 'unknown',
  };
  const baseline = {
    state: {
      protection: {
        tables: { ProviderConfig: 'old', Account: 'accounts', AiRoutingSettings: 'default' },
      },
      counters: { runs: 0 },
    },
  };
  const plan = { baseline, healthHashes: { original: 'health' } };
  const current = {
    target: structuredClone(baseline),
    otherConfigHash: 'old',
    fullConfigHash: 'with-owned',
    healthHashes: { original: 'health' },
    ownedHealth: 0,
  };
  current.target.state.protection.tables.ProviderConfig = 'with-owned';
  return { record: { plan, owned, initialOwned: structuredClone(owned) }, current };
}

test('输入固定为两个模型、三用途、显式价格、停用且不返回占位 Key', () => {
  const input = publicControlledInput();
  assert.equal(input.enabled, false);
  assert.equal(input.models.length, 2);
  assert.equal(input.executionRoutes.length, 3);
  assert(!Object.hasOwn(input, 'apiKey'));
  const { record } = fixture();
  assertControlledOwned(record.owned, record.owned.id);
});

test('完整阶段只允许优先级与明确认证边界变化，凭据按原值或清除/重新输入检查', () => {
  const { record } = fixture();
  verifyControlledStage(record, record.owned, 'opened');
  const priority = structuredClone(record.owned);
  priority.priority = 992;
  priority.revision = '2026-10-21T00:00:01.000Z';
  verifyControlledStage(record, priority, 'priority');
  record.owned = priority;
  verifyControlledStage(record, priority, 'cancelled');
  const none = structuredClone(priority);
  none.settings.authMode = 'none';
  none.credentialPlainHash = null;
  none.credentialCipherHash = null;
  none.revision = '2026-10-21T00:00:02.000Z';
  verifyControlledStage(record, none, 'none');
  record.owned = none;
  const entered = structuredClone(none);
  entered.settings.authMode = 'api_key';
  entered.credentialPlainHash = controlledHash(controlledConfigKeys.second);
  entered.credentialCipherHash = 'new-cipher';
  entered.revision = '2026-10-21T00:00:03.000Z';
  verifyControlledStage(record, entered, 'reentered');
});

for (const [name, mutate] of [
  [
    '错误 ID',
    (value) => {
      value.id = 'other';
    },
  ],
  [
    '启用配置',
    (value) => {
      value.enabled = true;
    },
  ],
  [
    '用途模式丢失',
    (value) => {
      value.settings.executionRoutes[0].mode = 'json_validated';
    },
  ],
  [
    '覆盖值变化',
    (value) => {
      value.settings.executionRoutes[0].firstOutputTimeoutMs = 1000;
    },
  ],
  [
    '价格变化',
    (value) => {
      value.settings.modelPricing['controlled-model-a'].costPer1kInput = 9;
    },
  ],
  [
    '空 Key 编辑覆盖原密文',
    (value) => {
      value.credentialCipherHash = 'overwritten';
    },
  ],
]) {
  test(`拒绝${name}`, () => {
    const { record } = fixture(),
      changed = structuredClone(record.owned);
    changed.priority = 992;
    changed.revision = '2026-10-21T00:00:01.000Z';
    mutate(changed);
    assert.throws(() => verifyControlledStage(record, changed, 'priority'));
  });
}

test('只接受两类等义表示，不改写原始快照', () => {
  const { record } = fixture(),
    changed = structuredClone(record.owned);
  changed.priority = 992;
  changed.revision = '2026-10-21T00:00:01.000Z';
  for (const route of changed.settings.executionRoutes) {
    delete route.enabled;
    route.modeOverridden = true;
  }
  verifyControlledStage(record, changed, 'priority');
  assert.equal(record.owned.settings.executionRoutes[0].enabled, true);
  assert(!Object.hasOwn(record.owned.settings.executionRoutes[0], 'modeOverridden'));
});

for (const flag of ['enabled', 'modeOverridden']) {
  test(`显式 ${flag}=false 仍拒绝`, () => {
    const { record } = fixture(),
      changed = structuredClone(record.owned);
    changed.priority = 992;
    changed.revision = '2026-10-21T00:00:01.000Z';
    changed.settings.executionRoutes[0][flag] = false;
    assert.throws(() => verifyControlledStage(record, changed, 'priority'));
  });
}

test('只有精确排除自有配置且总摘要绑定成功才接受保护结果', () => {
  const { record, current } = fixture();
  verifyControlledProtection(record.plan, current);
});

for (const [name, mutate] of [
  [
    '原配置或 Key 变化',
    (value) => {
      value.otherConfigHash = 'changed';
    },
  ],
  [
    '未绑定总摘要',
    (value) => {
      value.fullConfigHash = 'stale';
    },
  ],
  [
    '默认变化',
    (value) => {
      value.target.state.protection.tables.AiRoutingSettings = 'changed';
    },
  ],
  [
    '业务变化',
    (value) => {
      value.target.state.protection.tables.Account = 'changed';
    },
  ],
  [
    '模型调用',
    (value) => {
      value.target.state.counters.runs = 1;
    },
  ],
  [
    '连接或用途测试',
    (value) => {
      value.ownedHealth = 1;
    },
  ],
  [
    '旧健康事实变化',
    (value) => {
      value.healthHashes.original = 'changed';
    },
  ],
]) {
  test(`拒绝保护范围外的${name}`, () => {
    const { record, current } = fixture();
    mutate(current);
    assert.throws(() => verifyControlledProtection(record.plan, current));
  });
}
