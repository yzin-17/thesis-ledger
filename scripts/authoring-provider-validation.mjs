import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { aiGenerationContracts } from '../packages/schemas/dist/index.js';

// 固定开发目标与现有零费率模型；凭据由服务端保留，不读取或输出密钥。
assert.deepEqual(process.argv.slice(2), ['--confirm=thesis-ledger-dev/thesis_ledger']);
const base = 'http://127.0.0.1:3000/api/v1';
const providerName = 'lmstudio';
const originalModel = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive';
const model = `${originalModel}@q4_k_m`;
const contracts = [
  aiGenerationContracts.authoringAnalysis,
  aiGenerationContracts.authoringGeneration,
  aiGenerationContracts.authoringModification,
].map((contract) => contract.ref);
const activeUpdates = execFileSync('ps', ['-axo', 'args'], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => /^bash .*scripts\/(update|sync-code)\.sh\b/.test(line.trim()));
assert.equal(activeUpdates.length, 0, '目标更新仍在执行，先等待完整更新结束');
const runtime = JSON.parse(
  execFileSync('docker', ['inspect', 'thesis-ledger-dev-thesis-ledger-1'], { encoding: 'utf8' }),
)[0];
assert.equal(runtime.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
assert.equal(runtime.State.Health.Status, 'healthy');
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.THESIS_LEDGER_LAN_TOKEN
        ? { authorization: `Bearer ${process.env.THESIS_LEDGER_LAN_TOKEN}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(320000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`Provider 验证 HTTP ${response.status}：${JSON.stringify(data)}`);
  return data;
}
function pricingInput(prices) {
  return Object.fromEntries(
    Object.entries(prices).map(([key, value]) => [
      key,
      Object.fromEntries(
        ['costPer1kInput', 'costPer1kOutput', 'costCurrency']
          .filter((field) => value[field] !== undefined)
          .map((field) => [field, value[field]]),
      ),
    ]),
  );
}
function stableConfiguration(provider) {
  return Object.fromEntries(
    [
      'name',
      'baseUrl',
      'authMode',
      'upstreamFormat',
      'chatImplementation',
      'enabled',
      'priority',
      'capabilities',
      'timeoutMs',
      'firstOutputTimeoutMs',
      'outputIdleTimeoutMs',
      'credentialConfigured',
    ].map((key) => [key, provider[key]]),
  );
}
const before = (await request('/ai/providers')).find((provider) => provider.name === providerName);
assert(before?.enabled, '现有模型必须已启用');
assert(
  before.models.includes(originalModel) &&
    before.models.every((item) => [originalModel, model].includes(item)),
  '模型配置已变化，停止写入',
);
const catalogResponse = await fetch(`${before.baseUrl.replace(/\/$/, '')}/models`, {
  signal: AbortSignal.timeout(10000),
});
assert(catalogResponse.ok && before.authMode === 'none', '本入口只验证无密钥的既有本地模型目录');
const catalog = await catalogResponse.json();
assert(
  catalog.data.some((item) => item.id === model),
  '实际返回模型标识必须在在线模型目录中存在',
);
const price = before.modelPricing?.[originalModel];
assert.equal(price?.costPer1kInput, 0);
assert.equal(price?.costPer1kOutput, 0);
assert.equal(price?.costCurrency, 'USD');
const originalRoutes = before.executionRouteConfigs ?? [];
const input = Object.fromEntries(
  [
    'name',
    'baseUrl',
    'models',
    'authMode',
    'upstreamFormat',
    'chatImplementation',
    'modelDefaults',
    'modelReasoning',
    'enabled',
    'priority',
    'capabilities',
    'timeoutMs',
    'firstOutputTimeoutMs',
    'outputIdleTimeoutMs',
    'costPer1kInput',
    'costPer1kOutput',
    'costCurrency',
  ]
    .filter((key) => before[key] !== undefined)
    .map((key) => [key, before[key]]),
);
input.expectedRevision = before.updatedAt;
input.modelPricing = pricingInput(before.modelPricing);
input.modelPricing[model] = pricingInput(before.modelPricing)[originalModel];
input.models = [...new Set([...before.models, model])];
input.modelDefaults = { ...before.modelDefaults, [model]: before.modelDefaults[originalModel] };
if (before.modelReasoning?.[originalModel])
  input.modelReasoning = {
    ...before.modelReasoning,
    [model]: before.modelReasoning[originalModel],
  };
input.executionRoutes = originalRoutes.filter(
  (route) =>
    !(route.model === originalModel && contracts.some((ref) => ref.id === route.contract.id)),
);
input.executionRoutes = input.executionRoutes.map((route) => {
  const current = contracts.find((ref) => ref.id === route.contract.id);
  if (route.model === model && current) return { ...route, contract: current };
  return route;
});
for (const contract of contracts) {
  if (!originalRoutes.some((route) => route.model === model && route.contract.id === contract.id))
    input.executionRoutes.push({
      model,
      contract,
      mode: 'native_schema',
      outputPolicy: 'auto',
      modeOverridden: false,
      enabled: true,
    });
}
const plan = await request('/ai/providers/validation-plan', input);
assert(plan.maxCalls <= 9, '本次仅允许三个新增用途的有界验证');
assert(
  plan.pending.every(
    (item) => item.model === model && contracts.some((ref) => ref.id === item.purpose),
  ),
  '现有用途验证已失效，停止并重新审查配置',
);
assert(
  plan.estimatedCosts.every((cost) => cost.currency === 'USD' && Number(cost.amount) === 0),
  '费用不再为明确零费率，停止调用',
);
console.log(JSON.stringify({ stage: '验证计划', provider: providerName, model, ...plan }));
const operationId = randomUUID();
console.log(
  JSON.stringify({
    stage: '本次验证操作',
    operationId,
    pendingPurposes: plan.pending.map((item) => item.purpose),
  }),
);
if (plan.maxCalls > 0) {
  try {
    await request('/ai/providers/test-and-save', {
      provider: input,
      authorization: {
        operationId,
        planFingerprint: plan.planFingerprint,
        authorized: true,
        maxCalls: plan.maxCalls,
        allowTextFallback: false,
      },
    });
  } catch (error) {
    throw new Error(`验证未确认完成，保留操作 ${operationId} 的事实，不自动重发：${error.message}`);
  }
}
const after = (await request('/ai/providers')).find((provider) => provider.name === providerName);
assert.deepEqual(stableConfiguration(after), stableConfiguration(before), '现有连接配置必须保持');
assert.deepEqual(pricingInput(after.modelPricing), input.modelPricing, '现有费率必须保持');
assert.deepEqual(after.models, input.models);
assert.deepEqual(after.modelDefaults, input.modelDefaults);
for (const route of originalRoutes.filter(
  (route) => !contracts.some((ref) => ref.id === route.contract.id),
))
  assert.deepEqual(
    after.executionRouteConfigs.find(
      (item) => item.model === route.model && item.contract.id === route.contract.id,
    ),
    route,
  );
const readiness = await request(`/ai/providers/${providerName}/readiness`);
const authoring = readiness.filter(
  (route) => route.model === model && contracts.some((ref) => ref.id === route.contract.id),
);
assert.equal(authoring.length, 3);
for (const route of authoring) {
  assert.equal(route.liveValidation?.status, 'passed', `用途 ${route.contract.id} 必须实际通过`);
  assert(
    route.readiness.reasons.every((reason) => reason === 'budget_not_authorized'),
    '存在编写用途就绪阻断',
  );
}
console.log(
  JSON.stringify({
    stage: '验证及配置保存完成',
    operationId,
    provider: providerName,
    model,
    revision: after.updatedAt,
    maxCalls: plan.maxCalls,
    estimatedCosts: plan.estimatedCosts,
    routes: authoring,
  }),
);
