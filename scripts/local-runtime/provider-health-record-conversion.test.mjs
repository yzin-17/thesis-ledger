import assert from 'node:assert/strict';
import test from 'node:test';
import { aiGenerationContracts } from '../../packages/schemas/dist/index.js';
import {
  convertHealthRecord,
  healthRecordTransaction,
} from './provider-health-record-conversion.mjs';
import { maintenanceArguments } from './provider-health-record-maintenance.mjs';

const row = () => ({
  id: 'controlled-row',
  provider: 'controlled',
  state: 'healthy',
  errorCode: null,
  details: {
    kind: 'ai_provider_test',
    testKind: 'connection',
    mode: 'json_validated',
    model: 'model',
    adapter: 'openai-compatible-chat',
    configurationFingerprint: 'original-config',
    actualModel: null,
    usage: { status: 'unknown', inputTokens: null, outputTokens: null },
    cost: {
      status: 'unknown',
      amount: null,
      currency: null,
      source: 'unknown',
      pricingVersion: null,
    },
  },
});

test('连接、生成和成功慢响应转换只更新详情，保留原始计量及配置指纹', () => {
  const original = row(),
    before = structuredClone(original);
  const result = convertHealthRecord(original);
  assert.equal(result.action, 'convert');
  assert.equal(result.details.status, 'passed');
  assert.deepEqual(result.details.usage, original.details.usage);
  assert.deepEqual(result.details.cost, original.details.cost);
  assert.equal(result.details.configurationFingerprint, 'original-config');
  assert(!('fingerprint' in result.details));
  assert(!('requestId' in result.details));
  assert.deepEqual(original, before);
  original.state = 'degraded';
  assert.equal(convertHealthRecord(original).details.status, 'passed');
  original.details.testKind = 'generation';
  original.details.purpose = 'research';
  original.details.contract = aiGenerationContracts.research.ref;
  assert.equal(convertHealthRecord(original).action, 'convert');
  original.details.contract = { id: 'research', version: 'research-generation-v2' };
  assert.equal(convertHealthRecord(original).action, 'delete');
});

test('失败和取消只映射已有事实，不将未知费用写为零', () => {
  const original = row();
  original.state = 'down';
  original.errorCode = 'timeout';
  assert.equal(convertHealthRecord(original).details.status, 'failed');
  original.state = 'degraded';
  original.errorCode = 'cancelled';
  assert.equal(convertHealthRecord(original).details.status, 'cancelled');
  assert.equal(convertHealthRecord(original).details.cost.amount, null);
});

test('错误归因、缺失事实和矛盾状态必须删除；非旧记录拒绝进入转换', () => {
  const invalid = [
    {
      ...row(),
      details: {
        ...row().details,
        contract: { id: 'research', version: 'research-generation-v2' },
      },
    },
    { ...row(), details: { ...row().details, model: undefined } },
    { ...row(), details: { ...row().details, status: 'unrecognized' } },
    { ...row(), errorCode: 'timeout' },
    {
      ...row(),
      state: 'degraded',
      errorCode: 'timeout',
      details: { ...row().details, status: 'cancelled' },
    },
    {
      ...row(),
      errorCode: 'timeout',
      state: 'down',
      details: { ...row().details, errorCode: 'other' },
    },
  ];
  for (const value of invalid) assert.equal(convertHealthRecord(value).action, 'delete');
  assert.throws(() => convertHealthRecord({ details: null }));
  assert.throws(() => convertHealthRecord({ details: { kind: 'ai_provider_validation' } }));
});

test('维护默认只读计划，执行需精确开发目标和备份目录，事务默认回滚', () => {
  assert.equal(maintenanceArguments(['--target', 'thesis-ledger-dev']).mode, 'plan');
  assert.throws(() => maintenanceArguments(['--target', 'production']));
  assert.throws(() => maintenanceArguments(['--target', 'thesis-ledger-dev', '--mode', 'apply']));
  const snapshot = {
    database: 'thesis_ledger',
    owner: 'thesis_ledger',
    rows: [row()],
    untouched: 'digest',
  };
  const actions = snapshot.rows.map(convertHealthRecord);
  const query = healthRecordTransaction(snapshot, actions);
  assert(query.includes('ROLLBACK;'));
  assert(!query.includes('COMMIT;'));
  assert.throws(() => healthRecordTransaction({ ...snapshot, owner: 'other' }, actions, true));
  assert.throws(() => healthRecordTransaction(snapshot, [], true));
  assert.throws(() => healthRecordTransaction(snapshot, [{ ...actions[0], id: 'other' }], true));
});
