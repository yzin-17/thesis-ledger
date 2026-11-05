import assert from 'node:assert/strict';
import { aiProviderInputSchema } from '../apps/server/dist/src/ai/ai-provider.contracts.js';
import { controlledHash } from './ai-controlled-config-contract.mjs';

export const typeConfigName = 'controlled-type-contract-20261021';
export const typeConfigKey = 'controlled-type-placeholder-20261021';
export function typeConfigInput() {
  return aiProviderInputSchema.parse({
    name: typeConfigName,
    enabled: false,
    priority: 993,
    capabilities: ['chat'],
    baseUrl: 'http://127.0.0.1:9/v1',
    authMode: 'api_key',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    apiKey: typeConfigKey,
    models: ['controlled-type-model'],
    timeoutMs: 10000,
    modelPricing: {},
    executionRoutes: [],
  });
}
export function publicTypeInput() {
  const input = typeConfigInput();
  delete input.apiKey;
  return input;
}
export function assertTypeOwned(owned, expectedId) {
  assert.equal(owned.name, typeConfigName);
  if (expectedId) assert.equal(owned.id, expectedId);
  assert(['ai', 'market'].includes(owned.type));
  assert.equal(owned.enabled, false);
  assert.equal(owned.priority, 993);
  assert.equal(owned.credentialPlainHash, controlledHash(typeConfigKey));
  assert(owned.credentialCipherHash);
  assert(!Object.hasOwn(owned.settings, 'apiKey'));
  assert(!Object.hasOwn(owned.settings, 'credentialsRef'));
  if (owned.type === 'market') {
    assert.deepEqual(owned.capabilities, ['quote']);
    assert.deepEqual(owned.settings, {}, '行情保存不得泄漏 AI 专属设置');
  } else {
    assert.deepEqual(owned.capabilities, ['chat']);
    assert.equal(owned.settings.baseUrl, 'http://127.0.0.1:9/v1');
    assert.equal(owned.settings.authMode, 'api_key');
    assert.equal(owned.settings.upstreamFormat, 'chat-completions');
    assert.equal(owned.settings.chatImplementation, 'compatible');
    assert.deepEqual(owned.settings.models, ['controlled-type-model']);
    assert.deepEqual(owned.settings.executionRoutes, []);
    assert.deepEqual(owned.settings.modelPricing, {});
  }
}
export function verifyTypeStage(record, owned, stage) {
  assertTypeOwned(owned, record.initialOwned.id);
  if (stage === 'rejected') {
    assert.deepEqual(owned, record.owned, '空 Key 反向保存被拒后仍应保持行情原记录');
    assert.equal(owned.type, 'market');
    return;
  }
  assert(['market', 'returned'].includes(stage));
  assert.equal(owned.type, stage === 'market' ? 'market' : 'ai');
  assert(Date.parse(owned.revision) > Date.parse(record.owned.revision));
  const common = (row) => {
    const { settings, capabilities, type, revision, ...rest } = row;
    if (stage === 'returned') delete rest.credentialCipherHash;
    return rest;
  };
  assert.deepEqual(common(owned), common(record.initialOwned), '通用字段或原凭证变化');
  if (stage === 'returned') {
    assert.notEqual(
      owned.credentialCipherHash,
      record.initialOwned.credentialCipherHash,
      '显式重填占位 Key 后应重新加密；不自动复用失去原地址的凭证',
    );
    assert.equal(
      owned.settings.timeoutMs,
      30000,
      '返回 AI 应使用新草稿默认值，不恢复已清理的旧超时',
    );
  }
}
