// 在维护容器中使用正式 Provider 保存边界；不启动业务调度或直接改写配置表。
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiGenerationContracts } from '../../packages/schemas/dist/index.js';
import { PrismaService } from '../../apps/server/dist/src/platform/prisma.service.js';
import { ProviderConfigService } from '../../apps/server/dist/src/providers/provider-config.service.js';
import { ProviderHealthService } from '../../apps/server/dist/src/providers/provider-health.service.js';
import { AiRoutingSettingsService } from '../../apps/server/dist/src/ai/ai-routing-settings.service.js';
import { AiProviderService } from '../../apps/server/dist/src/ai/ai-provider.service.js';
import { AiProviderSaveService } from '../../apps/server/dist/src/ai/ai-provider-save.service.js';
import { AiProviderValidationJournal } from '../../apps/server/dist/src/ai/ai-provider-validation-journal.js';
import { AiProviderRegistry } from '../../apps/server/dist/src/ai/provider-registry.js';
import { AiSdkGenerationAdapter } from '../../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { parseAiProviderSettings } from '../../apps/server/dist/src/ai/ai-provider-summary.js';

const mode = process.argv[2];
assert(['plan', 'apply'].includes(mode));
assert.equal(process.env.ARENA_ROUTE_UPGRADE_AUTHORIZED, '1');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/thesis_ledger');
const db = new PrismaService(), output = '/work/evidence';
const write = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
try {
  const [identity] = await db.$queryRaw`SELECT current_database() AS name,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()`;
  assert.deepEqual(identity, { name: 'thesis_ledger', owner: 'thesis_ledger' });
  const [busy] = await db.$queryRaw`SELECT count(*)::int AS count FROM "ArenaLiveCycle" WHERE state='running'`;
  assert.equal(busy.count, 0, '有模型研究正在运行，等待原任务结束');
  const row = await db.providerConfig.findUniqueOrThrow({ where: { name: 'lmstudio' } });
  const settings = parseAiProviderSettings(row.settings);
  assert.equal(settings.authMode, 'none'); assert.equal(settings.models.length, 1);
  const model = settings.models[0], rate = settings.modelPricing[model];
  assert.equal(rate.costPer1kInput, 0); assert.equal(rate.costPer1kOutput, 0);
  const oldRoute = settings.executionRoutes.find(r => r.contract.id === 'arena_live_research' && r.model === model);
  assert(oldRoute); assert(['arena-live-research-v2', 'arena-live-research-v3', 'arena-live-research-v4', 'arena-live-research-v5', aiGenerationContracts.arenaLiveResearch.ref.version].includes(oldRoute.contract.version));
  const routes = settings.executionRoutes.map(r => r === oldRoute
    ? { ...r, contract: aiGenerationContracts.arenaLiveResearch.ref, mode: 'native_schema', outputPolicy: 'manual', modeOverridden: true } : r);
  const input = { name: row.name, enabled: row.enabled, priority: row.priority, capabilities: row.capabilities,
    expectedRevision: row.updatedAt.toISOString(), executionRoutes: routes,
    modelPricing: Object.fromEntries(Object.entries(settings.modelPricing).map(([key, p]) => [key, { costPer1kInput: p.costPer1kInput, costPer1kOutput: p.costPer1kOutput, costCurrency: p.costCurrency }])) };
  for (const key of ['baseUrl', 'models', 'modelCatalog', 'authMode', 'upstreamFormat', 'chatImplementation', 'compatibilityExtensionProfile',
    'modelDefaults', 'modelReasoning', 'timeoutMs', 'firstOutputTimeoutMs', 'outputIdleTimeoutMs'])
    if (settings[key] !== undefined) input[key] = settings[key];
  const health = new ProviderHealthService(db, {}), configs = new ProviderConfigService(db, health), registry = new AiProviderRegistry();
  const sdk = new AiSdkGenerationAdapter();
  const providers = new AiProviderService(configs, health, registry, sdk, new AiRoutingSettingsService(db), db);
  const save = new AiProviderSaveService(providers, configs, sdk, health, new AiProviderValidationJournal(db));
  const plan = await save.plan(input);
  write('plan.json', { mode, input, plan, beforeSettings: row.settings });
  assert(plan.pending.every(r => r.purpose === 'arena_live_research' && r.model === model), '其他用途需要重验，先保留配置核对差异');
  console.log(JSON.stringify({ status: 'plan_ready', mode, pending: plan.pending, maxCalls: plan.maxCalls }));
  if (mode === 'apply') {
    await save.testAndSave(input, { operationId: randomUUID(), authorized: true, allowTextFallback: false,
      planFingerprint: plan.planFingerprint, maxCalls: plan.maxCalls, stopOnFirstFailure: true });
    const stored = await configs.findStored(row.name), current = parseAiProviderSettings(stored.settings);
    const other = r => r.contract.id !== 'arena_live_research';
    assert.deepEqual(current.executionRoutes.filter(other), settings.executionRoutes.filter(other));
    assert.deepEqual(current.models, settings.models); assert.equal(current.baseUrl, settings.baseUrl);
    assert.equal(current.authMode, settings.authMode); assert.equal(stored.enabled, row.enabled);
    assert.equal(stored.priority, row.priority); assert.deepEqual(stored.encryptedCredentials, row.encryptedCredentials);
    registry.strictReadyContract({ providerId: row.name, model, contract: aiGenerationContracts.arenaLiveResearch.ref, budgetAuthorized: true });
    write('result.json', { status: 'passed', model, settings: stored.settings, updatedAt: stored.updatedAt });
    console.log(JSON.stringify({ status: 'passed', model, contract: aiGenerationContracts.arenaLiveResearch.ref, otherRoutesPreserved: true }));
  }
} finally { await db.$disconnect(); }
