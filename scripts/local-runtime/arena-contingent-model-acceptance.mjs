// 模型原话→正式生成／提交→配置回读→受控事件。所有账户写入仅限专属隔离库。
import '../../apps/server/node_modules/reflect-metadata/Reflect.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aiGenerationContracts, arenaLiveProtocolSchema, arenaLiveAccountSchema, arenaLiveDecisionSchema } from '../../packages/schemas/dist/index.js';
import { arenaDecisionPlanLines } from '../../packages/domain/dist/index.js';
import { fixtureAt } from '../fixtures/arena-contingent-orders.mjs';
import { contingentIntentCases, caseContext, initialCaseAccount, simulateCase, caseConfigurationConforms, caseExecutionConforms, simulationMatching } from './arena-contingent-model-scenarios.mjs';
import { PrismaService } from '../../apps/server/dist/src/platform/prisma.service.js';
import { AiProviderRegistry } from '../../apps/server/dist/src/ai/provider-registry.js';
import { AiSdkGenerationAdapter } from '../../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { createStoredAiProvider } from '../../apps/server/dist/src/ai/ai-provider-runtime.js';
import { parseAiProviderSettings } from '../../apps/server/dist/src/ai/ai-provider-summary.js';
import { routeSnapshotsFromProviderRow } from '../../apps/server/dist/src/ai/ai-provider-readiness.persistence.js';
import { aiProviderInputSchema } from '../../apps/server/dist/src/ai/ai-provider.contracts.js';
import { validateProviderRoute } from '../../apps/server/dist/src/ai/ai-provider-validation-runner.js';
import { routeValidationFingerprint } from '../../apps/server/dist/src/ai/ai-provider-validation-policy.js';
import { LiveMatchesRepository } from '../../apps/server/dist/src/model-arena/live/live-matches.repository.js';
import { LiveOrdersRepository } from '../../apps/server/dist/src/model-arena/live/live-orders.repository.js';
import { liveAgents, saveLiveAccount } from '../../apps/server/dist/src/model-arena/live/live-storage.js';
import { saveLiveTimeline, liveTimeline } from '../../apps/server/dist/src/model-arena/live/live-timeline.js';
import { LiveResearchBudget } from '../../apps/server/dist/src/model-arena/live/live-research-budget.js';
import { LiveResearchCall } from '../../apps/server/dist/src/model-arena/live/live-research-call.js';
import { LiveResearchRunner } from '../../apps/server/dist/src/model-arena/live/live-research-runner.js';

export { contingentIntentCases };

export async function acceptContingentModel({ databaseUrl, row: source, output }) {
  const requested = process.env.ARENA_MODEL_CASES?.split(',');
  const samples = requested ? contingentIntentCases.filter(s => requested.includes(s.id)) : contingentIntentCases;
  assert(samples.length > 0 && (!requested || samples.length === requested.length), '验收样本名无效');
  const maxOutputTokens = Number(process.env.ARENA_MODEL_OUTPUT_TOKENS ?? 4096);
  assert(Number.isSafeInteger(maxOutputTokens) && maxOutputTokens >= 4096 && maxOutputTokens <= 32768);
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/arena_contingent_model_acceptance');
  const write = (name, data) => writeFileSync(resolve(output, name), JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  const row = { ...source, encryptedCredentials: null, updatedAt: new Date(source.updatedAt) };
  const settings = parseAiProviderSettings(row.settings), model = settings.models[0];
  assert.equal(settings.authMode, 'none');
  const existing = settings.executionRoutes.find(r => r.model === model && r.contract.id === 'arena_live_research');
  assert(existing, '需要已配置的竞技场路由');
  const route = { ...existing, contract: aiGenerationContracts.arenaLiveResearch.ref, outputPolicy: 'manual', modeOverridden: true };
  const rate = settings.modelPricing[model];
  const input = aiProviderInputSchema.parse({ name: row.name, baseUrl: settings.baseUrl, models: [model], authMode: 'none',
    upstreamFormat: settings.upstreamFormat, chatImplementation: settings.chatImplementation,
    modelPricing: { [model]: { costPer1kInput: rate.costPer1kInput, costPer1kOutput: rate.costPer1kOutput, costCurrency: rate.costCurrency } },
    modelDefaults: settings.modelDefaults, modelReasoning: settings.modelReasoning, executionRoutes: [route],
  });
  assert.equal(rate.costPer1kInput, 0); assert.equal(rate.costPer1kOutput, 0);
  const sdk = new AiSdkGenerationAdapter(), generate = sdk.generate.bind(sdk);
  let calls = 0;
  sdk.generate = async request => {
    assert(calls < samples.length + 1, '调用仅限一份资格探针及本批意图'); calls++;
    console.log(JSON.stringify({ status: 'model_dispatch', call: calls, contract: request.contract.version }));
    return generate(request);
  };
  const health = [], validation = { input, credential: '', operationId: randomUUID(),
    signal: AbortSignal.timeout(300000), deadline: Date.now() + 300000,
    remainingCalls: 1, allowText: false, stopOnFirstFailure: true };
  let qualified;
  try {
    qualified = await validateProviderRoute(validation, route, routeValidationFingerprint(input, route, ''), sdk,
      { recordHistory: async (...args) => { health.push(args); } });
  } finally { write('qualification.json', { health, calls }); }
  row.settings = { ...row.settings, executionRoutes: [route], generationValidation: [qualified.record] };
  const provider = await createStoredAiProvider(row, { readCredential: () => { throw new Error('禁止读取凭证'); } }, 30000);
  assert(provider);
  const registry = new AiProviderRegistry();
  registry.replace([provider], routeSnapshotsFromProviderRow(row, parseAiProviderSettings(row.settings), row.health));
  registry.strictReadyContract({ providerId: row.name, model, contract: route.contract, budgetAuthorized: true });
  const db = new PrismaService({ datasourceUrl: databaseUrl }), results = [];
  try {
    for (const sample of samples) {
      const budgetAmount = { requests: 1, tokens: 100000, costMicros: 0 };
      const protocol = arenaLiveProtocolSchema.parse({ version: 2, title: '条件委托模型隔离验收 ' + sample.id,
        market: 'US', currency: 'USD', timeZone: 'America/New_York', calendarId: 'controlled', calendarVersion: 'controlled',
        startsOn: '2026-11-13', endsOn: '2026-11-16', universe: 'market', instruments: [], allowWebSearch: false,
        initialCash: '100000', entrants: [{ providerId: row.name, model, budget: budgetAmount, maxInputTokens: 80000, maxOutputTokens }],
        maxPositionBps: 10000, fees: { version: 'controlled', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
        matching: simulationMatching,
        benchmarks: ['cash'], decisionDeadlineMinutes: 5, maxInfrastructureAttempts: 1, budgetCurrency: 'USD', budget: budgetAmount,
        resources: { maxActiveSymbols: 50, maxResearchSteps: 1, maxCycleSeconds: 300, quoteIntervalSeconds: 30, maxQuoteAgeSeconds: 60 } });
      const matches = new LiveMatchesRepository(db), owner = randomUUID();
      const match = await matches.create(owner, protocol); await matches.transition(owner, match.id, 'running');
      const [agent] = await liveAgents(db, match.id), account = arenaLiveAccountSchema.parse(initialCaseAccount(sample));
      // 预置撤余／撤保护的独立账户；只写当前隔离比赛，保留已发生的逐笔成交。
      await saveLiveAccount(db, agent.id, account);
      await saveLiveTimeline(db, match.id, { ...await liveTimeline(db, match.id), phase: 'replay', cursorAt: fixtureAt,
        pendingAt: fixtureAt, status: 'research', reason: null });
      const cycleId = randomUUID(), deadline = new Date(Date.now() + 300000);
      const frozen = { protocol, account, asOf: fixtureAt, replay: true, marketSession: { state: 'open', date: '2026-11-13', reason: 'controlled-fixture' } };
      await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",state,attempt,trigger,"bookRevision","requestId",input,"leaseUntil","deadlineAt")
        VALUES (${cycleId}::uuid,${match.id}::uuid,${agent.id}::uuid,'running',1,'[]',${account.revision},${randomUUID()}::uuid,${JSON.stringify(frozen)}::jsonb,${deadline},${deadline})`;
      const session = { state: 'open', date: '2026-11-13', sessions: [{ startAt: '2026-11-13T14:30:00Z', endAt: '2026-11-13T21:00:00Z' }] };
      const orders = new LiveOrdersRepository(db, { build: async () => ({ session, context: caseContext(), missing: {} }) });
      const budget = new LiveResearchBudget(db), call = new LiveResearchCall(db, registry, sdk, budget);
      const messages = [];
      const runner = new LiveResearchRunner(db, { generate: (id, attempt, original, signal) => {
        const prompt = [...original, { role: 'user', content: '这是已确定计划的独立模拟配置验收，无需再请求资料。受控执行事实：今天是2026年11月13日，AAPL.US可交易，价格360美元，每手1股、价格步长0.01美元、买入当日可卖；资金与持仓以本次账户快照为准。请直接提交我的完整计划，并安排下一分钟观察。\n' + sample.intent }];
        messages.push(prompt); return call.generate(id, attempt, prompt, signal);
      } }, { execute: async () => { throw new Error('controlled_tools_unavailable'); } }, budget, orders);
      await runner.execute(cycleId, 1);
      const [cycle] = await db.$queryRaw`SELECT * FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
      const submitted = arenaLiveAccountSchema.parse((await liveAgents(db, match.id))[0].account);
      const simulation = simulateCase(sample, submitted), exited = simulation.final;
      const response = [...(cycle.requestAudit?.calls ?? [])].reverse().find(c => c.output?.action === 'decision')?.output?.decision;
      const parsed = arenaLiveDecisionSchema.safeParse(cycle.decision ?? response);
      const decision = parsed.success ? parsed.data : null;
      const configurationConforms = caseConfigurationConforms(sample, decision, account);
      const executionConforms = caseExecutionConforms(sample, submitted, simulation);
      let category = 'passed';
      if (!sample.supported) category = 'schema_not_supported';
      else if (decision && !configurationConforms) category = 'model_selected_wrong_structure';
      else if (cycle.state !== 'succeeded') {
        const truncated = cycle.requestAudit?.calls?.some(c => c.error?.code === 'output_truncated');
        category = truncated ? 'generation_output_truncated' : (cycle.reason === 'model_output_invalid' ? 'model_invalid_structure' : 'generation_or_submission_failed');
      }
      else if (!executionConforms) category = 'engine_execution_deviation';
      const generatedText = [...(cycle.requestAudit?.calls ?? [])].reverse().find(c => c.diagnostics?.outputText)?.diagnostics.outputText;
      let generatedConfiguration = decision;
      if (!decision && generatedText) { try { generatedConfiguration = JSON.parse(generatedText).decision; } catch { /* 原始非法文本保留在调用审计中。 */ } }
      const result = { id: sample.id, supported: sample.supported, category, state: cycle.state, reason: cycle.reason, generatedConfiguration,
        generationErrors: (cycle.requestAudit?.calls ?? []).flatMap(c => c.error ? [c.error.code ?? c.error] : []),
        configuration: decision, readback: decision ? arenaDecisionPlanLines(decision, undefined, account) : [],
        fills: exited.fills.map(({ side, quantity, price }) => ({ side, quantity, price })) };
      write(sample.id + '.json', { intent: sample.intent, messages, cycle, submitted, snapshots: simulation.snapshots, exited, result });
      results.push(result); console.log(JSON.stringify({ status: 'case_settled', id: sample.id, category }));
    }
    return { status: results.filter(r => r.supported).every(r => r.category === 'passed') ? 'passed_supported_cases' : 'needs_attention',
      model, calls, maxOutputTokens, providerWrites: 0, historicalWrites: 0, results };
  } finally { await db.$disconnect(); }
}
