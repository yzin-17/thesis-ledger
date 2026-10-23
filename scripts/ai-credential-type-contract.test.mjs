import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  typeConfigName,
  typeConfigKey,
  publicTypeInput,
  assertTypeOwned,
  verifyTypeStage,
} from './ai-credential-type-contract.mjs';
import { controlledHash } from './ai-controlled-config-contract.mjs';

function fixture() {
  const input = publicTypeInput(),
    settings = { ...input };
  for (const key of ['name', 'priority', 'enabled', 'capabilities']) delete settings[key];
  const initialOwned = {
    id: '97000000-0000-4000-8000-000000000001',
    name: typeConfigName,
    enabled: false,
    priority: 993,
    capabilities: ['chat'],
    type: 'ai',
    settings,
    revision: '2026-10-21T00:00:00.000Z',
    credentialPlainHash: controlledHash(typeConfigKey),
    credentialCipherHash: 'cipher',
    health: 'unknown',
  };
  const market = {
    ...structuredClone(initialOwned),
    type: 'market',
    capabilities: ['quote'],
    settings: {},
    revision: '2026-10-21T00:00:01.000Z',
  };
  return { record: { initialOwned, owned: initialOwned }, market };
}
test('停用、未知价格、无用途的固定输入及双向转换合同', () => {
  const { record, market } = fixture();
  assert(!Object.hasOwn(publicTypeInput(), 'apiKey'));
  assertTypeOwned(record.initialOwned);
  verifyTypeStage(record, market, 'market');
  record.owned = market;
  verifyTypeStage(record, market, 'rejected');
  const returned = structuredClone(record.initialOwned);
  returned.settings.timeoutMs = 30000;
  returned.credentialCipherHash = 'explicitly-reentered-cipher';
  returned.revision = '2026-10-21T00:00:02.000Z';
  record.owned = market;
  verifyTypeStage(record, returned, 'returned');
});
for (const [name, mutate] of [
  [
    '错误 ID',
    (row) => {
      row.id = 'other';
    },
  ],
  [
    '启用',
    (row) => {
      row.enabled = true;
    },
  ],
  [
    '原凭证被重加密',
    (row) => {
      row.credentialCipherHash = 'changed';
    },
  ],
  [
    '凭证明文摘要变化',
    (row) => {
      row.credentialPlainHash = 'changed';
    },
  ],
  [
    '专属设置泄漏',
    (row) => {
      row.settings = { models: ['old'] };
    },
  ],
  [
    '错误能力',
    (row) => {
      row.capabilities = ['chat'];
    },
  ],
  [
    '优先级丢失',
    (row) => {
      row.priority = 100;
    },
  ],
  [
    '旧版本',
    (row) => {
      row.revision = '2026-10-21T00:00:00.000Z';
    },
  ],
])
  test(`拒绝${name}`, () => {
    const { record, market } = fixture();
    mutate(market);
    assert.throws(() => verifyTypeStage(record, market, 'market'));
  });
