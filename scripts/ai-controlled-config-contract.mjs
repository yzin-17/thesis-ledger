import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { aiGenerationContracts } from '../packages/schemas/dist/index.js';
import { aiProviderInputSchema } from '../apps/server/dist/src/ai/ai-provider.contracts.js';

export const controlledConfigName = 'controlled-config-contract-20261021';
export const controlledConfigKeys = {
  first: 'controlled-acceptance-placeholder-a-20261021',
  second: 'controlled-acceptance-placeholder-b-20261021',
};
export const controlledHash = (value) => createHash('sha256').update(value).digest('hex');
export const controlledFingerprint = (value) => controlledHash(JSON.stringify(value));

export function controlledConfigInput() {
  return aiProviderInputSchema.parse({
    name: controlledConfigName,
    baseUrl: 'http://127.0.0.1:9/v1',
    enabled: false,
    priority: 991,
    capabilities: ['chat'],
    authMode: 'api_key',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    apiKey: controlledConfigKeys.first,
    models: ['controlled-model-a', 'controlled-model-b'],
    timeoutMs: 10000,
    firstOutputTimeoutMs: 4000,
    outputIdleTimeoutMs: 2000,
    modelPricing: {
      'controlled-model-a': { costPer1kInput: 0.1, costPer1kOutput: 0.2, costCurrency: 'USD' },
      'controlled-model-b': { costPer1kInput: 0, costPer1kOutput: 0.05, costCurrency: 'CNY' },
    },
    executionRoutes: [
      {
        model: 'controlled-model-a',
        mode: 'native_schema',
        outputPolicy: 'manual',
        enabled: true,
        contract: aiGenerationContracts.research.ref,
        firstOutputTimeoutMs: 90000,
        outputIdleTimeoutMs: 45000,
      },
      {
        model: 'controlled-model-a',
        mode: 'json_validated',
        outputPolicy: 'manual',
        enabled: true,
        contract: aiGenerationContracts.parameterOptimization.ref,
        firstOutputTimeoutMs: 60000,
        outputIdleTimeoutMs: 30000,
      },
      {
        model: 'controlled-model-b',
        mode: 'json_validated',
        outputPolicy: 'manual',
        enabled: true,
        contract: aiGenerationContracts.research.ref,
        firstOutputTimeoutMs: 30000,
        outputIdleTimeoutMs: 15000,
      },
    ],
  });
}

export function publicControlledInput() {
  const input = controlledConfigInput();
  delete input.apiKey;
  return input;
}

// 旧显式用途省略 enabled 或 modeOverridden 时，现有读取边界均按 true 处理。
const canonicalRoute = (route) => {
  for (const key of ['enabled', 'modeOverridden'])
    assert(route[key] === undefined || typeof route[key] === 'boolean', '用途布尔字段非法');
  return { ...route, enabled: route.enabled ?? true, modeOverridden: route.modeOverridden ?? true };
};
const canonicalOwned = (owned) => ({
  ...owned,
  settings: {
    ...owned.settings,
    executionRoutes: owned.settings.executionRoutes.map(canonicalRoute),
  },
});

export function assertControlledOwned(owned, expectedId) {
  const input = publicControlledInput();
  assert(owned, '专属条目不存在');
  assert.equal(owned.name, controlledConfigName);
  if (expectedId) assert.equal(owned.id, expectedId, '自有 ID 变化');
  assert.equal(owned.type, 'ai');
  assert.equal(owned.enabled, false, '专属配置必须始终停用');
  assert.equal(owned.settings.baseUrl, input.baseUrl);
  assert(
    !Object.hasOwn(owned.settings, 'apiKey') && !Object.hasOwn(owned.settings, 'credentialsRef'),
    '设置中不得保存明文凭证',
  );
  assert.deepEqual(owned.settings.models, input.models);
  assert.deepEqual(
    owned.settings.executionRoutes.map(canonicalRoute),
    input.executionRoutes.map(canonicalRoute),
    '用途、模式或覆盖变化',
  );
  assert.deepEqual(Object.keys(owned.settings.modelPricing).sort(), input.models);
  for (const model of input.models) {
    const actual = owned.settings.modelPricing[model];
    for (const key of ['costPer1kInput', 'costPer1kOutput', 'costCurrency'])
      assert.equal(actual[key], input.modelPricing[model][key], '模型价格变化');
  }
}

export function verifyControlledStage(record, owned, stage) {
  assertControlledOwned(owned, record.owned.id);
  const previous = record.owned;
  if (stage === 'opened' || stage === 'cancelled') {
    assert.deepEqual(owned, previous, '未保存或取消阶段发生持久变化');
    return;
  }
  assert(['priority', 'none', 'reentered'].includes(stage));
  assert(Date.parse(owned.revision) > Date.parse(previous.revision), '保存未推进修订');
  const expected = structuredClone(previous);
  expected.revision = owned.revision;
  if (stage === 'priority') expected.priority = 992;
  if (stage === 'none') {
    expected.settings.authMode = 'none';
    expected.credentialCipherHash = null;
    expected.credentialPlainHash = null;
  }
  if (stage === 'reentered') {
    expected.settings.authMode = 'api_key';
    expected.credentialPlainHash = controlledHash(controlledConfigKeys.second);
    assert(
      owned.credentialCipherHash &&
        owned.credentialCipherHash !== record.initialOwned.credentialCipherHash,
    );
    expected.credentialCipherHash = owned.credentialCipherHash;
  }
  assert.deepEqual(canonicalOwned(owned), canonicalOwned(expected), '本阶段之外的自有配置发生变化');
}

export function verifyControlledProtection(plan, current) {
  assert.equal(
    current.fullConfigHash,
    current.target.state.protection.tables.ProviderConfig,
    '配置总摘要与排除证明不在同一状态',
  );
  assert.equal(
    current.otherConfigHash,
    plan.baseline.state.protection.tables.ProviderConfig,
    '原配置或凭据摘要变化',
  );
  assert.deepEqual(current.healthHashes, plan.healthHashes, '旧健康记录变化');
  assert.equal(current.ownedHealth, 0, '验收不得发起连接或用途测试');
  const comparable = structuredClone(current.target);
  comparable.state.protection.tables.ProviderConfig =
    plan.baseline.state.protection.tables.ProviderConfig;
  assert.deepEqual(comparable, plan.baseline, '账户、默认、路由、业务或模型计数变化');
}
