import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import {
  assertCloudflareExperimentRequest,
  liveExperimentTargetReadProgram,
  publicLiveExperimentTarget,
} from './research-live-experiment-target.mjs';

const base = 'https://api.cloudflare.com/client/v4/accounts/benchmark-account/ai/v1';
test('只允许既有账号的官方Chat POST，不允许查询、跨账号、重定向或URL凭据', () => {
  assert.doesNotThrow(() =>
    assertCloudflareExperimentRequest(base, base + '/chat/completions', 'POST'),
  );
  for (const [url, method] of [
    [base + '/chat/completions?key=synthetic', 'POST'],
    [base.replace('benchmark-account', 'other') + '/chat/completions', 'POST'],
    ['https://example.com/chat/completions', 'POST'],
    [base + '/chat/completions', 'GET'],
    [base.replace('https://', 'https://secret@') + '/chat/completions', 'POST'],
  ])
    assert.throws(() => assertCloudflareExperimentRequest(base, url, method));
});
test('公开回执不包含明文凭据和账号访问地址', () => {
  const value = publicLiveExperimentTarget({
    apiKey: 'synthetic-private',
    baseURL: base,
    providerId: 'cloudflare',
    model: 'qwen',
    revision: 'r1',
    pricing: { costCurrency: 'USD' },
    credentialCipherHash: 'hash',
    moduleHashes: {},
    protectedState: {},
    activeRuns: 0,
    requestOptionsModel: 'qwen',
    requestOptions: { headers: { 'cf-aig-gateway-id': 'configured' } },
  });
  const text = JSON.stringify(value);
  assert(!text.includes('synthetic-private'));
  assert(!text.includes(base));
  assert.equal(value.providerId, 'cloudflare');
  assert.equal(value.requestOptions.headers['cf-aig-gateway-id'], 'configured');
});

const require = createRequire(import.meta.url);
const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
const cloudflareModel = '@cf/qwen/qwen3.8-27b';
async function readConfiguredTarget(provider, selectedModel, modelDefaults) {
  const configuredModel = provider === 'cloudflare' ? cloudflareModel : 'openrouter/free';
  const settings = {
    models: [configuredModel],
    modelPricing: { [configuredModel]: { costPer1kInput: 0, costPer1kOutput: 0 } },
    modelDefaults,
    executionRoutes: [],
    authMode: 'api_key',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    baseUrl: provider === 'cloudflare' ? base : 'https://openrouter.ai/api/v1',
  };
  const tx = {
    $executeRawUnsafe: async (sql) => assert.equal(sql, 'SET TRANSACTION READ ONLY'),
    $queryRawUnsafe: async () => [{ database: 'thesis_ledger', role: 'thesis_ledger_app' }],
  };
  for (const table of [
    'account',
    'accountLedgerState',
    'ledgerEvent',
    'trade',
    'journalEntry',
    'providerConfig',
    'aiRoutingSettings',
    'aiRun',
    'aiToolCall',
    'notificationDelivery',
    'recurringCashDepositPlan',
    'recurringCashDepositOccurrence',
  ])
    tx[table] = { findMany: async () => [] };
  tx.aiRun.count = async () => 0;
  tx.providerConfig.findUniqueOrThrow = async ({ where }) => {
    assert.equal(where.name, provider);
    return {
      enabled: provider === 'openrouter',
      settings,
      updatedAt: new Date('2026-11-02T00:00:00Z'),
      encryptedCredentials: 'synthetic-cipher',
    };
  };
  const load = (name) => {
    if (name === '@prisma/client')
      return {
        PrismaClient: class {
          $transaction = async (callback) => callback(tx);
          $disconnect = async () => {};
        },
      };
    return serverRequire(name);
  };
  let output = '',
    error = '';
  const process = {
    argv: ['node', '-', 'metadata-only', provider, selectedModel],
    stdout: {
      write: (text) => {
        output += text;
      },
    },
    stderr: {
      write: (text) => {
        error += text;
      },
    },
  };
  await runInNewContext(liveExperimentTargetReadProgram, {
    require: (name) => {
      if (name === 'node:module') return { createRequire: () => load };
      if (name === 'node:fs') return { readFileSync: () => Buffer.from('compiled-fixture') };
      return require(name);
    },
    process,
    URL,
  });
  return { value: output ? JSON.parse(output) : null, error, exitCode: process.exitCode };
}

test('只读导出前端按实际型号保存的全部请求参数，不读取其它型号的头', async () => {
  const options = {
    headers: { 'cf-aig-gateway-id': 'configured', 'cf-aig-collect-log': 'true' },
    body: { reasoning_effort: 'medium' },
    outputTokenLimit: 'budget',
  };
  const result = await readConfiguredTarget('cloudflare', cloudflareModel, {
    [cloudflareModel]: { requestOptions: options },
    other: { requestOptions: { headers: { 'x-unrelated': 'other' } } },
  });
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.value.requestOptions, options);
  assert.equal(result.value.requestOptionsModel, cloudflareModel);
});

test('OpenRouter实际实验型号与路由型号分别读取，未配置时冻结空对象', async () => {
  const model = 'nvidia/nemotron-3.5-super-vl:free';
  const defaults = {
    'openrouter/free': { requestOptions: { headers: { 'x-unrelated': 'router' } } },
    [model]: { requestOptions: { headers: { 'x-observation': 'nemotron' } } },
  };
  const selected = await readConfiguredTarget('openrouter', model, defaults);
  assert.deepEqual(selected.value.requestOptions, defaults[model].requestOptions);
  assert.equal(selected.value.requestOptionsModel, model);
  delete defaults[model];
  const empty = await readConfiguredTarget('openrouter', model, defaults);
  assert.deepEqual(empty.value.requestOptions, {});
});

test('存量非法请求头在只读导出时拒绝，错误不导出配置或凭据', async () => {
  const result = await readConfiguredTarget('cloudflare', cloudflareModel, {
    [cloudflareModel]: { requestOptions: { headers: { Authorization: 'synthetic-private' } } },
  });
  assert.equal(result.value, null);
  assert.equal(result.exitCode, 1);
  assert.equal(result.error, '固定目标只读核查失败');
});
