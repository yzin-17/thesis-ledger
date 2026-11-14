import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { aiGenerationContracts, strategySchema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { OpenAiCompatibleProvider } from '../../src/ai/provider-adapters.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { StrategyOptimizationAiSettlementStore } from '../../src/strategy-optimization/strategy-optimization-ai-settlement.store.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import {
  createDiscoverySeed,
  STRATEGY_SPACE_VERSION,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { describeStrategyParameters } from '../../src/strategy-optimization/strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationSdkExecutor } from '../../src/strategy-optimization/strategy-optimization-sdk-executor.js';
import {
  createNormalizedRunConfig,
  createStrategyFixture,
} from './strategy-optimization-postgres-fixtures.js';

const databaseUrl = process.env.AI_EXECUTION_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;
const writeSse = (response: ServerResponse, content: string) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const common = {
    id: 'optimization-postgres-fixture',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fixture-model',
  };
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [],
      usage: { prompt_tokens: 13, completion_tokens: 5, total_tokens: 18 },
    })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
};

postgresDescribe('strategy optimization SDK isolated PostgreSQL vertical', () => {
  const suiteScope = sdkPostgresContext();
  registerSdkPersistenceAndCacheCase(suiteScope);
  registerSdkDiscoveryAndFormatCases(suiteScope);
});

function sdkPostgresContext() {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const strategy = createStrategyFixture('600519.SH', suffix)('0.05');
  const experimentId = randomUUID();
  const formatExperimentId = randomUUID();
  const discoveryExperimentId = randomUUID();
  const discoveryScope = {
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
  } as const;
  const discoverySeed = createDiscoverySeed(discoveryScope);
  let strategyId = '';
  let strategyVersionId = '';
  let discoveryStrategyId = '';
  let discoveryStrategyVersionId = '';
  let baseURL = '';
  let requestCount = 0;
  const receivedRequests: Array<{ messages: unknown[] }> = [];
  const proposal = {
    changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
    reason: '隔离 PostgreSQL 业务纵向',
    evidenceRefs: [],
  };
  let responseContent = JSON.stringify(proposal);
  const server = createServer(async (request, response) => {
    requestCount += 1;
    let body = '';
    for await (const chunk of request) body += String(chunk);
    receivedRequests.push(JSON.parse(body));
    writeSse(response, responseContent);
  });
  const provider = (credentialFingerprint: string) =>
    new OpenAiCompatibleProvider(
      'local-sdk-postgres',
      ['fixture-model'],
      `${baseURL}/v1`,
      'local-secret',
      2_000,
      {
        costPer1kInput: 0.01,
        costPer1kOutput: 0.02,
        costCurrency: 'USD',
        pricingVersion: 'fixture-v1',
      },
      {
        health: 'healthy',
        adapter: 'openai-compatible',
        credentialFingerprint,
        executionRoutes: [
          {
            model: 'fixture-model',
            mode: 'json_validated',
            contract: aiGenerationContracts.parameterOptimization.ref,
          },
          {
            model: 'fixture-model',
            mode: 'json_validated',
            contract: aiGenerationContracts.strategyDiscovery.ref,
          },
        ],
      },
    );
  const readExperiment = async () => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid
    `);
    return rows[0]!;
  };
  const readDiscoveryExperiment = async () => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${discoveryExperimentId}::uuid
    `);
    return rows[0]!;
  };
  const readFormatExperiment = async () => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${formatExperimentId}::uuid
    `);
    return rows[0]!;
  };
  const fixtureState = {
    get prisma() {
      return prisma;
    },
    get suffix() {
      return suffix;
    },
    get strategy() {
      return strategy;
    },
    get experimentId() {
      return experimentId;
    },
    get formatExperimentId() {
      return formatExperimentId;
    },
    get discoveryExperimentId() {
      return discoveryExperimentId;
    },
    get discoveryScope() {
      return discoveryScope;
    },
    get discoverySeed() {
      return discoverySeed;
    },
    get strategyId() {
      return strategyId;
    },
    set strategyId(value: typeof strategyId) {
      strategyId = value;
    },
    get strategyVersionId() {
      return strategyVersionId;
    },
    set strategyVersionId(value: typeof strategyVersionId) {
      strategyVersionId = value;
    },
    get discoveryStrategyId() {
      return discoveryStrategyId;
    },
    set discoveryStrategyId(value: typeof discoveryStrategyId) {
      discoveryStrategyId = value;
    },
    get discoveryStrategyVersionId() {
      return discoveryStrategyVersionId;
    },
    set discoveryStrategyVersionId(value: typeof discoveryStrategyVersionId) {
      discoveryStrategyVersionId = value;
    },
    get baseURL() {
      return baseURL;
    },
    set baseURL(value: typeof baseURL) {
      baseURL = value;
    },
    get requestCount() {
      return requestCount;
    },
    set requestCount(value: typeof requestCount) {
      requestCount = value;
    },
    get receivedRequests() {
      return receivedRequests;
    },
    get proposal() {
      return proposal;
    },
    get responseContent() {
      return responseContent;
    },
    set responseContent(value: typeof responseContent) {
      responseContent = value;
    },
    get server() {
      return server;
    },
    get provider() {
      return provider;
    },
    get readExperiment() {
      return readExperiment;
    },
    get readDiscoveryExperiment() {
      return readDiscoveryExperiment;
    },
    get readFormatExperiment() {
      return readFormatExperiment;
    },
  };
  beforeAll(async () => {
    await initializeSdkPostgresFixture(fixtureState);
  });
  afterAll(async () => {
    await releaseSdkPostgresFixture(fixtureState);
  });
  return fixtureState;
}
function registerSdkPersistenceAndCacheCase(suiteScope: ReturnType<typeof sdkPostgresContext>) {
  it('贯通 ready route、本地 HTTP、事实结算与同指纹缓存', async () => {
    suiteScope.responseContent = JSON.stringify(suiteScope.proposal);
    const feedback = {
      development: {
        status: 'valid',
        completeness: 'complete',
        totalReturn: '-0.12345',
        maxDrawdown: '0.2',
        tradeCount: 3,
        futureHigh: 'sealed-a02-only',
        availableAt: '2038-11-22',
        eventCount: 999999,
        bars: ['sealed-a02-only'],
      },
      validation: {
        status: 'invalid',
        completeness: 'unavailable',
        failureCategory: 'data-unavailable',
        reason: 'sealed-a02-only 2038-11-22',
        events: ['sealed-a02-only'],
      },
      test: { status: 'valid', totalReturn: '0.987654321', turnover: '987654321' },
      overall: { futureHigh: 'sealed-a02-only' },
    };
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineMetrics"=${JSON.stringify(feedback)}::jsonb,
          "runConfig"=${JSON.stringify(createNormalizedRunConfig())}::jsonb
      WHERE "id"=${suiteScope.experimentId}::uuid
    `);
    await suiteScope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
        "executionHash", "proposal", "diff", "validationStatus", "metrics"
      ) VALUES (
        ${suiteScope.experimentId}::uuid, 99, 'local-sdk-postgres:fixture-model', ${suiteScope.strategyVersionId}::uuid,
        ${`feedback-${suiteScope.suffix}`}, '{}'::jsonb,
        ${JSON.stringify([
          {
            parameterId: 'risk.0.percent',
            before: '0.05',
            after: '0.07',
            label: 'sealed-a02-only',
            metadata: '2038-11-22',
          },
        ])}::jsonb,
        'test_valid', ${JSON.stringify(feedback)}::jsonb
      )
    `);
    const registry = new AiProviderRegistry();
    registry.register(suiteScope.provider('credential-v1'));
    const runs = new StrategyOptimizationRunService(suiteScope.prisma as never, {} as never);
    const executions = new AiExecutionStateStore(suiteScope.prisma as never);
    const executor = new StrategyOptimizationSdkExecutor(
      suiteScope.prisma as never,
      registry,
      new AiSdkGenerationAdapter(),
      executions,
      new StrategyOptimizationAiSettlementStore(executions),
    );
    const candidates = new StrategyOptimizationCandidateService(
      suiteScope.prisma as never,
      registry,
      runs,
      executor,
    );
    const baseline = {
      id: suiteScope.strategyVersionId,
      strategyId: suiteScope.strategyId,
      version: 1,
      schemaVersion: 2,
      schema: suiteScope.strategy,
      strategy: strategySchema.parse(suiteScope.strategy),
    } as never;
    const route = { provider: 'local-sdk-postgres', model: 'fixture-model' };

    const first = await candidates.generateProposal(
      await suiteScope.readExperiment(),
      baseline,
      describeStrategyParameters(suiteScope.strategy),
      route,
      1,
    );
    expect(first.proposal).toEqual(suiteScope.proposal);
    expect(suiteScope.requestCount).toBe(1);
    const actualRequest = JSON.stringify(suiteScope.receivedRequests[0]!.messages);
    for (const hidden of [
      'sealed-a02-only',
      '2038-11-22',
      '0.987654321',
      '987654321',
      'futureHigh',
      'eventCount',
      '"test"',
      '"overall"',
      '"bars"',
      '"events"',
      '"reason"',
    ]) {
      expect(actualRequest).not.toContain(hidden);
    }
    expect(actualRequest).toContain('-0.12345');
    expect(actualRequest).toContain('data-unavailable');
    expect(actualRequest).toContain('不得描述为严格无前视样本外');
    const user = suiteScope.receivedRequests[0]!.messages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'role' in message &&
        message.role === 'user',
    ) as { content: string };
    const projected = JSON.parse(user.content.slice(user.content.indexOf(':') + 1));
    expect(projected.priorCandidates).toHaveLength(1);
    expect(projected.baselineMetrics).toEqual(projected.priorCandidates[0].metrics);
    expect(projected.baselineMetrics.validation).not.toHaveProperty('totalReturn');
    await expect(
      candidates.createAndEvaluateCandidate(
        await suiteScope.readExperiment(),
        baseline,
        describeStrategyParameters(suiteScope.strategy),
        'local-sdk-postgres:fixture-model',
        first.proposal,
      ),
    ).rejects.toThrow();
    expect(suiteScope.requestCount).toBe(1);
    const replay = await candidates.generateProposal(
      await suiteScope.readExperiment(),
      baseline,
      describeStrategyParameters(suiteScope.strategy),
      route,
      1,
    );
    expect(replay.aiRunId).toBe(first.aiRunId);
    expect(suiteScope.requestCount).toBe(1);

    const saved = await suiteScope.prisma.aiRun.findUniqueOrThrow({ where: { id: first.aiRunId } });
    expect(saved).toMatchObject({ status: 'succeeded', inputTokens: 13, outputTokens: 5 });
    expect(saved.result).toEqual(suiteScope.proposal);
    const metadata = saved.modelMetadata as Record<string, unknown>;
    expect(metadata).toHaveProperty('sdkCacheIdentity.configurationFingerprint');
    expect(metadata).toHaveProperty('sdkExecution.generationStatus', 'complete');

    registry.replace([suiteScope.provider('credential-v2')]);
    await expect(
      candidates.generateProposal(
        await suiteScope.readExperiment(),
        baseline,
        describeStrategyParameters(suiteScope.strategy),
        route,
        1,
      ),
    ).rejects.toThrow(/配置已变更/);
    expect(suiteScope.requestCount).toBe(1);

    await suiteScope.prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "cancelRequestedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${suiteScope.experimentId}::uuid
    `);
    await expect(
      candidates.generateProposal(
        await suiteScope.readExperiment(),
        baseline,
        describeStrategyParameters(suiteScope.strategy),
        route,
        2,
      ),
    ).rejects.toThrow(/已取消/);
    expect(suiteScope.requestCount).toBe(1);
  });
}
function registerSdkDiscoveryAndFormatCases(suiteScope: ReturnType<typeof sdkPostgresContext>) {
  it('discovery 经严格路由和本地 HTTP 后由服务端装配固定字段并持久化', async () => {
    suiteScope.requestCount = 0;
    suiteScope.responseContent = JSON.stringify({
      strategy: {
        name: 'SDK discovery 候选',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'discovery-primary', field: 'close' },
          right: { type: 'constant', value: '100' },
        },
        exit: { type: 'positionState', field: 'isOpen' },
        sizing: { type: 'percentOfEquity', percent: '0.5' },
        risk: [{ type: 'fixedStop', percent: '0.05' }],
      },
      reason: '隔离 PostgreSQL discovery 纵向',
      evidenceRefs: [],
    });
    const registry = new AiProviderRegistry();
    registry.register(suiteScope.provider('credential-discovery'));
    const runs = new StrategyOptimizationRunService(suiteScope.prisma as never, {} as never);
    const executions = new AiExecutionStateStore(suiteScope.prisma as never);
    const executor = new StrategyOptimizationSdkExecutor(
      suiteScope.prisma as never,
      registry,
      new AiSdkGenerationAdapter(),
      executions,
      new StrategyOptimizationAiSettlementStore(executions),
    );
    const candidates = new StrategyOptimizationCandidateService(
      suiteScope.prisma as never,
      registry,
      runs,
      executor,
    );
    const baseline = {
      id: suiteScope.discoveryStrategyVersionId,
      strategyId: suiteScope.discoveryStrategyId,
      version: 0,
      schemaVersion: 2,
      schema: suiteScope.discoverySeed,
      strategy: suiteScope.discoverySeed,
    } as never;

    const generated = await candidates.generateProposal(
      await suiteScope.readDiscoveryExperiment(),
      baseline,
      [],
      { provider: 'local-sdk-postgres', model: 'fixture-model' },
      1,
    );

    expect(suiteScope.requestCount).toBe(1);
    expect(generated.proposal).toMatchObject({
      strategy: {
        schemaVersion: suiteScope.discoverySeed.schemaVersion,
        signalSources: suiteScope.discoverySeed.signalSources,
        executionInstrument: suiteScope.discoverySeed.executionInstrument,
        primaryTimeframe: suiteScope.discoverySeed.primaryTimeframe,
        execution: suiteScope.discoverySeed.execution,
        cost: suiteScope.discoverySeed.cost,
      },
    });
    const saved = await suiteScope.prisma.aiRun.findUniqueOrThrow({
      where: { id: generated.aiRunId },
    });
    expect(saved).toMatchObject({ status: 'succeeded', inputTokens: 13, outputTokens: 5 });
    expect(saved.result).toEqual(generated.proposal);
  });
  it('完整但无效的模型格式在隔离 PostgreSQL 中保留具体错误码和用量，不创建回测', async () => {
    suiteScope.requestCount = 0;
    suiteScope.responseContent = '{"changes":"not-an-array"}';
    const registry = new AiProviderRegistry();
    registry.register(suiteScope.provider('credential-format'));
    const runs = new StrategyOptimizationRunService(suiteScope.prisma as never, {} as never);
    const executions = new AiExecutionStateStore(suiteScope.prisma as never);
    const executor = new StrategyOptimizationSdkExecutor(
      suiteScope.prisma as never,
      registry,
      new AiSdkGenerationAdapter(),
      executions,
      new StrategyOptimizationAiSettlementStore(executions),
    );
    const candidates = new StrategyOptimizationCandidateService(
      suiteScope.prisma as never,
      registry,
      runs,
      executor,
    );
    const baseline = {
      id: suiteScope.strategyVersionId,
      strategyId: suiteScope.strategyId,
      version: 1,
      schemaVersion: 2,
      schema: suiteScope.strategy,
      strategy: strategySchema.parse(suiteScope.strategy),
    } as never;

    await expect(
      candidates.generateProposal(
        await suiteScope.readFormatExperiment(),
        baseline,
        describeStrategyParameters(suiteScope.strategy),
        { provider: 'local-sdk-postgres', model: 'fixture-model' },
        1,
      ),
    ).rejects.toMatchObject({
      fact: { code: 'schema_invalid', externalResult: 'complete' },
    });
    expect(suiteScope.requestCount).toBe(1);

    const attempts = await suiteScope.prisma.$queryRaw<
      Array<{ aiRunId: string; status: string; error: string }>
    >(
      Prisma.sql`SELECT "aiRunId", "status", "error" FROM "OptimizationAttempt"
        WHERE "experimentId"=${suiteScope.formatExperimentId}::uuid`,
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: 'failed' });
    expect(attempts[0]!.error).toContain('[模型格式错误]');
    const aiRun = await suiteScope.prisma.aiRun.findUniqueOrThrow({
      where: { id: attempts[0]!.aiRunId },
    });
    expect(aiRun).toMatchObject({
      status: 'failed',
      errorCode: 'optimization_schema_invalid',
      inputTokens: 13,
      outputTokens: 5,
    });
    expect(aiRun.modelMetadata).toHaveProperty(
      'sdkExecution.requests.0.error.code',
      'schema_invalid',
    );
    const experiment = await suiteScope.readFormatExperiment();
    expect(experiment).toMatchObject({
      aiCallsUsed: 1,
      backtestRunsUsed: 0,
      inputTokensUsed: 13,
      outputTokensUsed: 5,
    });
  });
}

async function initializeSdkPostgresFixture(
  lifecycleScope: ReturnType<typeof sdkPostgresContext>,
): Promise<void> {
  lifecycleScope.server.listen(0, '127.0.0.1');
  await once(lifecycleScope.server, 'listening');
  const address = lifecycleScope.server.address();
  if (!address || typeof address === 'string') throw new Error('本地 Provider fixture 启动失败');
  lifecycleScope.baseURL = `http://127.0.0.1:${address.port}`;
  const storedStrategy = await lifecycleScope.prisma.strategy.create({
    data: { schemaVersion: 2, name: `SDK PostgreSQL ${lifecycleScope.suffix}` },
  });
  lifecycleScope.strategyId = storedStrategy.id;
  const version = await lifecycleScope.prisma.strategyVersion.create({
    data: {
      strategyId: lifecycleScope.strategyId,
      version: 1,
      schemaVersion: 2,
      schema: lifecycleScope.strategy,
    },
  });
  lifecycleScope.strategyVersionId = version.id;
  const storedDiscoveryStrategy = await lifecycleScope.prisma.strategy.create({
    data: { schemaVersion: 2, name: `SDK discovery PostgreSQL ${lifecycleScope.suffix}` },
  });
  lifecycleScope.discoveryStrategyId = storedDiscoveryStrategy.id;
  const discoveryVersion = await lifecycleScope.prisma.strategyVersion.create({
    data: {
      strategyId: lifecycleScope.discoveryStrategyId,
      version: 0,
      schemaVersion: 2,
      schema: lifecycleScope.discoverySeed,
    },
  });
  lifecycleScope.discoveryStrategyVersionId = discoveryVersion.id;
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${lifecycleScope.experimentId}::uuid, ${lifecycleScope.strategyVersionId}::uuid, 'running', 'generation',
        '{"mode":"balanced","minClosedTrades":1}'::jsonb,
        '["risk.0.percent"]'::jsonb, '{}'::jsonb, '{}'::jsonb, ${`sdk-pg-${lifecycleScope.suffix}`},
        '[{"provider":"local-sdk-postgres","model":"fixture-model","costStatus":"known","costCurrency":"USD"}]'::jsonb,
        '{"maxAiCalls":2,"maxBacktestRuns":2,"maxInputTokens":20000,"maxOutputTokens":2000,"maxCost":"10","maxDurationSeconds":1800}'::jsonb,
        1, ${`sdk-pg-${lifecycleScope.suffix}`}
      )
    `);
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "sourceMode", "discoveryScope", "strategySpaceVersion",
        "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${lifecycleScope.discoveryExperimentId}::uuid, 'discovery', ${JSON.stringify(lifecycleScope.discoveryScope)}::jsonb,
        ${STRATEGY_SPACE_VERSION}, ${lifecycleScope.discoveryStrategyVersionId}::uuid, 'running', 'generation',
        '{"mode":"balanced","minClosedTrades":1}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
        ${`sdk-discovery-pg-${lifecycleScope.suffix}`},
        '[{"provider":"local-sdk-postgres","model":"fixture-model","costStatus":"known","costCurrency":"USD"}]'::jsonb,
        '{"maxAiCalls":1,"maxBacktestRuns":2,"maxInputTokens":20000,"maxOutputTokens":2000,"maxCost":"10","maxDurationSeconds":1800}'::jsonb,
        1, ${`sdk-discovery-pg-${lifecycleScope.suffix}`}
      )
    `);
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${lifecycleScope.formatExperimentId}::uuid, ${lifecycleScope.strategyVersionId}::uuid, 'running', 'generation',
        '{"mode":"balanced","minClosedTrades":1}'::jsonb,
        '["risk.0.percent"]'::jsonb, '{}'::jsonb, ${JSON.stringify(createNormalizedRunConfig())}::jsonb,
        ${`sdk-format-pg-${lifecycleScope.suffix}`},
        '[{"provider":"local-sdk-postgres","model":"fixture-model","costStatus":"known","costCurrency":"USD"}]'::jsonb,
        '{"maxAiCalls":1,"maxBacktestRuns":1,"maxInputTokens":20000,"maxOutputTokens":2000,"maxCost":"10","maxDurationSeconds":1800}'::jsonb,
        1, ${`sdk-format-pg-${lifecycleScope.suffix}`}
      )
    `);
}

async function releaseSdkPostgresFixture(
  lifecycleScope: ReturnType<typeof sdkPostgresContext>,
): Promise<void> {
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationCandidate" WHERE "experimentId"=${lifecycleScope.experimentId}::uuid
    `);
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationAttempt"
      WHERE "experimentId" IN (${lifecycleScope.experimentId}::uuid, ${lifecycleScope.discoveryExperimentId}::uuid, ${lifecycleScope.formatExperimentId}::uuid)
    `);
  await lifecycleScope.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationExperiment"
      WHERE "id" IN (${lifecycleScope.experimentId}::uuid, ${lifecycleScope.discoveryExperimentId}::uuid, ${lifecycleScope.formatExperimentId}::uuid)
    `);
  await lifecycleScope.prisma.aiRun.deleteMany({
    where: {
      OR: [
        {
          modelMetadata: {
            path: ['optimizationExperimentId'],
            equals: lifecycleScope.experimentId,
          },
        },
        {
          modelMetadata: {
            path: ['optimizationExperimentId'],
            equals: lifecycleScope.discoveryExperimentId,
          },
        },
        {
          modelMetadata: {
            path: ['optimizationExperimentId'],
            equals: lifecycleScope.formatExperimentId,
          },
        },
      ],
    },
  });
  if (lifecycleScope.strategyId)
    await lifecycleScope.prisma.strategyVersion.deleteMany({
      where: { strategyId: lifecycleScope.strategyId },
    });
  if (lifecycleScope.discoveryStrategyId)
    await lifecycleScope.prisma.strategyVersion.deleteMany({
      where: { strategyId: lifecycleScope.discoveryStrategyId },
    });
  if (lifecycleScope.strategyId)
    await lifecycleScope.prisma.strategy.delete({ where: { id: lifecycleScope.strategyId } });
  if (lifecycleScope.discoveryStrategyId)
    await lifecycleScope.prisma.strategy.delete({
      where: { id: lifecycleScope.discoveryStrategyId },
    });
  await lifecycleScope.prisma.$disconnect();
  lifecycleScope.server.close();
  await once(lifecycleScope.server, 'close');
}
