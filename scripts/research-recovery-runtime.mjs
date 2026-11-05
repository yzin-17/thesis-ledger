import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { controlledOrigin, recoveryDatabaseUrl } from './research-recovery-guards.mjs';

const require = createRequire('/app/package.json');
require('reflect-metadata');
export const schemas = require('@thesis-ledger/schemas');
const { PrismaClient, Prisma } = require('@prisma/client');
export { Prisma };
const { AiRunService } = require('/app/apps/server/dist/src/ai/ai-run.service.js');
const { AiExecutionStateStore } = require('/app/apps/server/dist/src/ai/ai-execution-state.store.js');
const { AiResearchExecutor } = require('/app/apps/server/dist/src/ai/ai-research.executor.js');
const { AiResearchSdkExecution } = require('/app/apps/server/dist/src/ai/ai-research-sdk-execution.js');
const { AiSdkGenerationAdapter } = require('/app/apps/server/dist/src/ai/ai-sdk-generation.adapter.js');
const { AiRoutingSettingsService } = require('/app/apps/server/dist/src/ai/ai-routing-settings.service.js');
const { AiProviderRegistry } = require('/app/apps/server/dist/src/ai/provider-registry.js');
const { PromptVersionRegistry } = require('/app/apps/server/dist/src/ai/prompt-registry.js');
const { AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1: profile } = require('/app/apps/server/dist/src/ai/ai-provider-upstream.js');
export const { sealAiFrozenResearchV2, verifyAiFrozenResearchV2 } = require('/app/apps/server/dist/src/ai/ai-research-frozen-integrity-v2.js');

export const owner = '4cb546a5-b04f-4c0a-9d3b-6a53fdb74f57';
export const access = { async assertSubmission() {}, async assertSnapshot() {} };

export async function createRecoveryRuntime(origin) {
  const url = recoveryDatabaseUrl(process.env.AI_EXECUTION_DATABASE_URL);
  assert(/^[a-f0-9-]{36}$/.test(process.env.RESEARCH_RECOVERY_TEST_TOKEN ?? ''));
  const upstream = controlledOrigin(origin);
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS name,current_user AS owner`;
  assert.equal(identity.name, 'restore_db'); assert.equal(identity.owner, 'restore_owner');
  const baseURL = upstream + '/v1';
  const provider = { id: 'controlled-provider', models: ['controlled-model'],
    metadata: { baseURL, authMode: 'none', upstreamFormat: 'chat-completions', adapter: 'openai-compatible',
      chatImplementation: 'compatible', health: 'healthy', compatibilityExtensionProfile: profile,
      executionRoutes: [{ model: 'controlled-model', mode: 'json_validated', contract: schemas.researchGenerationV2Contract.ref }],
      costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
    complete: async () => { throw new Error('恢复验收必须使用实际 SDK'); },
    sdkRuntime: () => ({ baseURL, apiKey: '', authMode: 'none', timeoutMs: 15_000 }) };
  const registry = new AiProviderRegistry(); registry.register(provider);
  const routing = new AiRoutingSettingsService(prisma);
  const runs = new AiRunService(prisma, registry, routing);
  const state = new AiExecutionStateStore(prisma);
  const sdk = new AiResearchSdkExecution(registry, new AiSdkGenerationAdapter(), state);
  const executor = new AiResearchExecutor(runs, prisma, registry, new PromptVersionRegistry(), state, sdk);
  return { prisma, routing, runs, state, executor, close: () => prisma.$disconnect() };
}

export async function prepareUnsent(runtime, runId, leaseMs = 300) {
  const claimed = await runtime.runs.claim(runId, leaseMs);
  assert(claimed, '受控任务无法领取');
  const requestId = randomUUID();
  const route = claimed.modelMetadata.researchRoutes[0];
  const prepared = await runtime.state.prepareRequest({ runId, executionAttempt: claimed.executionAttempt, requestId,
    reservation: { aiCalls: 1, inputTokens: 2000, outputTokens: 100,
      cost: { status: 'estimated', amount: '0', currency: 'USD', source: 'fixture', pricingVersion: null },
      provider: 'controlled-provider', model: 'controlled-model', configurationFingerprint: route.configurationFingerprint } });
  assert(prepared, '受控请求未形成持久化预留');
  return { executionAttempt: claimed.executionAttempt, requestId };
}
