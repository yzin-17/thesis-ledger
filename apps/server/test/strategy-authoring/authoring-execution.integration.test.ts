import 'reflect-metadata';
import { registerAuthoringAnalysisCases } from './authoring-execution-analysis.cases.js';
import { registerAuthoringSaveCases } from './authoring-execution-save.cases.js';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authoringStrategySchema } from '@thesis-ledger/schemas';
import type { IdentityService } from '../../src/identity/identity.service.js';
import type * as IdentityRuntime from '../../src/identity/identity.module.js';
import type * as PersistenceRuntime from '../../src/platform/prisma.service.js';
import type * as RedisRuntime from '../../src/platform/redis.service.js';
import type * as FilterRuntime from '../../src/platform/api-exception.filter.js';
import type * as SecurityRuntime from '../../src/platform/network-security.js';
import type * as AuthoringRuntime from '../../src/strategy-authoring/strategy-authoring.module.js';
import type * as DraftRuntime from '../../src/strategy-authoring/authoring-draft.repository.js';
import type * as OperationRuntime from '../../src/strategy-authoring/authoring-operation.repository.js';
import type * as SubmitRuntime from '../../src/strategy-authoring/authoring-submit.service.js';
import type * as ControllerRuntime from '../../src/strategy-authoring/authoring-operation.controller.js';
import type * as ExecutorRuntime from '../../src/strategy-authoring/authoring.executor.js';
import type * as WorkerRuntime from '../../src/strategy-authoring/authoring.worker.js';
import type * as QueueRuntime from '../../src/strategy-authoring/authoring-queue.js';
import type * as ProviderRuntime from '../../src/ai/ai-provider.service.js';
import type * as RegistryRuntime from '../../src/ai/provider-registry.js';
import type * as AuditRuntime from '../../src/ai/ai-invocation.store.js';
import type * as SdkRuntime from '../../src/ai/ai-sdk-generation.adapter.js';
import type * as AnalysisRuntime from '../../src/strategy-authoring/authoring-analysis.repository.js';
import type * as ResultRuntime from '../../src/strategy-authoring/authoring-result.repository.js';
import type * as InstrumentRuntime from '../../src/market/instrument.service.js';
import type * as SaveRuntime from '../../src/strategy-authoring/authoring-save.service.js';
import type * as SaveControllerRuntime from '../../src/strategy-authoring/authoring-save.controller.js';
import type * as SourceRuntime from '../../src/strategy-authoring/authoring-provenance.repository.js';
import type * as CreationRuntime from '../../src/backtest/strategy-creation.service.js';
import type * as AccessRuntime from '../../src/backtest/strategy-access.service.js';
import type * as ProposalRuntime from '../../src/strategy-authoring/authoring-proposal.service.js';
import type * as ProposalControllerRuntime from '../../src/strategy-authoring/authoring-proposal.controller.js';
import type * as HistoryRuntime from '../../src/strategy-authoring/authoring-operation-history.repository.js';
import type * as HistoryControllerRuntime from '../../src/strategy-authoring/authoring-operation-history.controller.js';

const enabled = process.env.AUTHORING_ISOLATED === '1';
describe.skipIf(!enabled)('隔离 PostgreSQL、Redis、HTTP Provider 与编写 API', () => {
  const load = async <T>(file: string): Promise<T> =>
    import(pathToFileURL(resolve('dist/src', file)).href) as Promise<T>;
  let app: INestApplication;
  let db: PrismaClient;
  let redis: Redis;
  let queue: QueueRuntime.AuthoringQueue;
  let worker: WorkerRuntime.AuthoringWorker;
  let operations: OperationRuntime.AuthoringOperationRepository;
  let execution: ExecutorRuntime.AuthoringExecutor;
  let base: string;
  let alice: Awaited<ReturnType<IdentityService['register']>>;
  let bob: typeof alice;
  let draftId: string;
  let instrumentId: string;
  let sources: SourceRuntime.AuthoringProvenanceRepository;
  let access: AccessRuntime.StrategyAccessService;
  const password = randomBytes(24).toString('base64url');
  const gateway = 'isolated-authoring-gateway';
  let modelReady = true;
  let pricesKnown = true;
  let providerCalls = 0;
  let output: unknown = { requirements: [], questions: [], runtimeIntents: [] };
  let actualModel = 'selected-authoring-model';
  let heldResponse: Promise<void> | undefined;
  const modelBodies: Array<{ model: string }> = [];
  const provider = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    providerCalls += 1;
    modelBodies.push(JSON.parse(Buffer.concat(chunks).toString()) as { model: string });
    await heldResponse;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const frame = (extra: Record<string, unknown>) => ({
      id: 'controlled-authoring',
      object: 'chat.completion.chunk',
      created: 1,
      model: actualModel,
      ...extra,
    });
    response.write(
      `data: ${JSON.stringify(frame({ choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: null }] }))}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify(
        frame({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
        }),
      )}\n\n`,
    );
    response.end('data: [DONE]\n\n');
  });
  const blank = {
    title: '隔离编写验收',
    description: '验证单一受控模型',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  };
  const selection = (idempotencyKey: string) => ({
    kind: 'analyze',
    expectedRevision: 1,
    idempotencyKey,
    providerId: 'controlled-authoring',
    model: 'selected-authoring-model',
    intent: '',
    unknownCostAcknowledgedAt: null,
  });
  async function request(
    path: string,
    status: number,
    body?: unknown,
    token?: string,
    method?: 'PATCH',
  ) {
    const response = await fetch(`${base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        authorization: `Bearer ${gateway}`,
        'content-type': 'application/json',
        ...(token ? { 'x-thesis-ledger-session': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status, path).toBe(status);
    return (await response.json()) as Record<string, unknown>;
  }
  async function observe(id: string) {
    for (let step = 0; step < 100; step++) {
      const result = await request(
        `/strategy-authoring/operations/${id}`,
        200,
        undefined,
        alice.token,
      );
      if (!['queued', 'running'].includes(result.status as string)) return result;
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
    }
    throw new Error('隔离编写未收敛');
  }
  const caseContext = () => ({
    get output() {
      return output;
    },
    set output(value: unknown) {
      output = value;
    },
    get providerCalls() {
      return providerCalls;
    },
    request,
    observe,
    selection,
    alice,
    bob,
    draftId,
    operations,
    db,
    blank,
    modelBodies,
    instrumentId,
    sources,
    access,
  });
  beforeAll(async () => {
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL!);
    const redisUrl = new URL(process.env.REDIS_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/journal_review_fixture' ||
      redisUrl.hostname !== '127.0.0.1' ||
      !process.env.AUTHORING_TEST_SCOPE
    )
      throw new Error('只允许维护入口新建的数据库和 Redis');
    url.username = 'fixture_app';
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$connect();
    redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 1 });
    redis.on('error', () => undefined);
    await redis.ping();
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const address = provider.address();
    if (!address || typeof address === 'string') throw new Error('受控 Provider 启动失败');
    const modules = await Promise.all([
      load<typeof IdentityRuntime>('identity/identity.module.js'),
      load<typeof PersistenceRuntime>('platform/prisma.service.js'),
      load<typeof FilterRuntime>('platform/api-exception.filter.js'),
      load<typeof SecurityRuntime>('platform/network-security.js'),
      load<typeof AuthoringRuntime>('strategy-authoring/strategy-authoring.module.js'),
      load<typeof DraftRuntime>('strategy-authoring/authoring-draft.repository.js'),
      load<typeof OperationRuntime>('strategy-authoring/authoring-operation.repository.js'),
      load<typeof SubmitRuntime>('strategy-authoring/authoring-submit.service.js'),
      load<typeof ControllerRuntime>('strategy-authoring/authoring-operation.controller.js'),
      load<typeof ExecutorRuntime>('strategy-authoring/authoring.executor.js'),
      load<typeof WorkerRuntime>('strategy-authoring/authoring.worker.js'),
      load<typeof QueueRuntime>('strategy-authoring/authoring-queue.js'),
      load<typeof AuditRuntime>('ai/ai-invocation.store.js'),
      load<typeof SdkRuntime>('ai/ai-sdk-generation.adapter.js'),
      load<typeof AnalysisRuntime>('strategy-authoring/authoring-analysis.repository.js'),
      load<typeof ResultRuntime>('strategy-authoring/authoring-result.repository.js'),
      load<typeof InstrumentRuntime>('market/instrument.service.js'),
      load<typeof SaveRuntime>('strategy-authoring/authoring-save.service.js'),
      load<typeof SaveControllerRuntime>('strategy-authoring/authoring-save.controller.js'),
      load<typeof SourceRuntime>('strategy-authoring/authoring-provenance.repository.js'),
      load<typeof CreationRuntime>('backtest/strategy-creation.service.js'),
      load<typeof AccessRuntime>('backtest/strategy-access.service.js'),
      load<typeof ProposalRuntime>('strategy-authoring/authoring-proposal.service.js'),
      load<typeof ProposalControllerRuntime>('strategy-authoring/authoring-proposal.controller.js'),
      load<typeof HistoryRuntime>('strategy-authoring/authoring-operation-history.repository.js'),
      load<typeof HistoryControllerRuntime>(
        'strategy-authoring/authoring-operation-history.controller.js',
      ),
    ]);
    const [
      identity,
      persistence,
      filter,
      security,
      authoring,
      draft,
      operation,
      submit,
      controller,
      executor,
      workerModule,
      queueModule,
      auditModule,
      sdkModule,
      analysisModule,
      resultModule,
      instrumentModule,
      saveModule,
      saveControllerModule,
      sourceModule,
      creationModule,
      accessModule,
      proposalModule,
      proposalControllerModule,
      historyModule,
      historyControllerModule,
    ] = modules;
    const redisService = { client: redis, ping: () => redis.ping() } as RedisRuntime.RedisService;
    const providerService = {
      refreshRegistry: vi.fn(async () => undefined),
    } as unknown as ProviderRuntime.AiProviderService;
    const registry = {
      strictReadyContract: ({ contract }: { contract: unknown }) => {
        if (!modelReady) throw new Error('受控路由未就绪');
        return {
          provider: {
            id: 'controlled-authoring',
            models: ['selected-authoring-model'],
            metadata: {
              modelPricing: {
                'selected-authoring-model': pricesKnown
                  ? { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' }
                  : {},
              },
            },
            sdkRuntime: () => ({
              baseURL: `http://127.0.0.1:${address.port}/v1`,
              apiKey: '',
              authMode: 'none',
              timeoutMs: 2000,
            }),
          },
          execution: {
            adapter: 'openai-compatible-chat',
            mode: 'native_schema',
            contract,
            readiness: { configurationFingerprint: 'a'.repeat(64) },
            liveValidation: { status: 'passed' },
          },
        };
      },
    } as unknown as RegistryRuntime.AiProviderRegistry;
    operations = new operation.AuthoringOperationRepository(db);
    const drafts = new draft.AuthoringDraftRepository(db);
    const audit = new auditModule.AiInvocationStore(db as never);
    const sdk = new sdkModule.AiSdkGenerationAdapter();
    queue = new queueModule.AuthoringQueue(redisService);
    execution = new executor.AuthoringExecutor(operations, providerService, registry, audit, sdk);
    worker = new workerModule.AuthoringWorker(redisService, queue, operations, execution, audit);
    const instruments = new instrumentModule.InstrumentService(db as never);
    instrumentId = (
      await db.instrument.create({
        data: {
          canonicalCode: '510300',
          instrumentType: 'ETF',
          market: 'SH',
          displayName: '隔离目录 ETF',
          generation: 1,
        },
      })
    ).id;
    const submissions = new submit.AuthoringSubmitService(
      drafts,
      operations,
      queue,
      providerService,
      registry,
      instruments,
    );
    sources = new sourceModule.AuthoringProvenanceRepository(db);
    access = new accessModule.StrategyAccessService(db as never);
    const saves = new saveModule.AuthoringSaveService(
      db as never,
      new creationModule.StrategyCreationService(),
      sources,
      instruments,
    );
    class FixturePersistence {}
    Global()(FixturePersistence);
    Module({
      providers: [{ provide: persistence.PrismaService, useValue: db }],
      exports: [persistence.PrismaService],
    })(FixturePersistence);
    class FixtureApplication {}
    Module({
      imports: [FixturePersistence, identity.IdentityModule, authoring.StrategyAuthoringModule],
      controllers: [
        controller.AuthoringOperationController,
        saveControllerModule.AuthoringSaveController,
        proposalControllerModule.AuthoringProposalController,
        historyControllerModule.AuthoringOperationHistoryController,
      ],
      providers: [
        { provide: operation.AuthoringOperationRepository, useValue: operations },
        { provide: submit.AuthoringSubmitService, useValue: submissions },
        { provide: auditModule.AiInvocationStore, useValue: audit },
        {
          provide: analysisModule.AuthoringAnalysisRepository,
          useValue: new analysisModule.AuthoringAnalysisRepository(db, drafts),
        },
        {
          provide: resultModule.AuthoringResultRepository,
          useValue: new resultModule.AuthoringResultRepository(db, drafts),
        },
        { provide: sourceModule.AuthoringProvenanceRepository, useValue: sources },
        { provide: saveModule.AuthoringSaveService, useValue: saves },
        {
          provide: proposalModule.AuthoringProposalService,
          useValue: new proposalModule.AuthoringProposalService(db, operations, sources, drafts),
        },
        {
          provide: historyModule.AuthoringOperationHistoryRepository,
          useValue: new historyModule.AuthoringOperationHistoryRepository(db),
        },
      ],
    })(FixtureApplication);
    app = await NestFactory.create(FixtureApplication, { logger: false });
    app.use(security.createLanAuthMiddleware(gateway));
    app.useGlobalFilters(new filter.ApiExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    await worker.start();
    alice = (await request('/identity/users', 201, {
      username: 'authoring.alice',
      password,
      displayName: '编写用户甲',
    })) as unknown as typeof alice;
    bob = (await request('/identity/users', 201, {
      username: 'authoring.bob',
      password,
      displayName: '编写用户乙',
    })) as unknown as typeof bob;
    draftId = (await request('/strategy-authoring/drafts', 201, blank, alice.token)).id as string;
  }, 30_000);
  afterAll(async () => {
    await worker?.onModuleDestroy();
    await queue?.onModuleDestroy();
    await app?.close();
    await redis?.quit();
    await db?.$disconnect();
    provider.close();
    vi.unstubAllEnvs();
  });
  it('真实排队到终态，幂等只调用一次，双用户读取与取消隔离', async () => {
    const first = await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      201,
      selection('once'),
      alice.token,
    );
    const repeated = await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      201,
      selection('once'),
      alice.token,
    );
    expect(repeated.id).toBe(first.id);
    await request(`/strategy-authoring/operations/${first.id}`, 404, undefined, bob.token);
    await request(`/strategy-authoring/operations/${first.id}/cancel`, 404, {}, bob.token);
    const finished = await observe(first.id as string);
    expect(finished.status).toBe('succeeded');
    expect(providerCalls).toBe(1);
    expect(modelBodies.map((body) => body.model)).toEqual(['selected-authoring-model']);
    const audit = finished.invocations as Array<{
      facts: Array<{ kind: string; details: { usage: unknown; cost: unknown } }>;
    }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.facts.map((fact) => fact.kind)).toEqual(['dispatching', 'received']);
    expect(audit[0]!.facts[1]!.details.usage).toEqual({
      status: 'reported',
      inputTokens: 12,
      outputTokens: 24,
    });
    expect(audit[0]!.facts[1]!.details.cost).toMatchObject({
      status: 'estimated',
      amount: '0',
      currency: 'USD',
      source: 'configured_model_pricing',
    });
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      409,
      { ...selection('once'), model: 'forged-model' },
      alice.token,
    );
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      400,
      { ...selection('forged'), cost: { amount: '0' } },
      alice.token,
    );
    expect(providerCalls).toBe(1);
  });
  it('模型格式失败保留实际用量，不自动重发或改写草稿', async () => {
    output = { unexpected: '结构错误' };
    const next = await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      201,
      selection('invalid-output'),
      alice.token,
    );
    const failed = await observe(next.id as string);
    expect(failed.status).toBe('failed');
    expect(providerCalls).toBe(2);
    expect(failed.outcome).toMatchObject({
      externalResult: 'received',
      errorCode: 'AUTHORING_SCHEMA_INVALID',
      usage: { status: 'reported', inputTokens: 12, outputTokens: 24 },
    });
    expect(
      (await request(`/strategy-authoring/drafts/${draftId}`, 200, undefined, alice.token))
        .revision,
    ).toBe(1);
    expect(
      (
        await request(
          `/strategy-authoring/drafts/${draftId}/operations`,
          201,
          selection('invalid-output'),
          alice.token,
        )
      ).id,
    ).toBe(next.id);
    expect(providerCalls).toBe(2);
    output = { requirements: [], questions: [], runtimeIntents: [] };
  });
  it('队列拒绝及模型未就绪不创建付费意图，查询失败不补投', async () => {
    await redis.quit();
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      503,
      selection('queue-rejected'),
      alice.token,
    );
    await redis.connect();
    await redis.ping();
    modelReady = false;
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      400,
      selection('model-rejected'),
      alice.token,
    );
    modelReady = true;
    expect(await operations.findIntent(alice.principal.id, draftId, 'queue-rejected')).toBeNull();
    expect(await operations.findIntent(alice.principal.id, draftId, 'model-rejected')).toBeNull();
    const direct = await operations.submit(alice.principal.id, draftId, {
      ...selection('not-delivered'),
      promptVersion: 'authoring-prompt-v1',
      capabilityVersion: 'authoring-v1',
      cost: { status: 'unknown', amount: null, currency: null, source: null, pricingVersion: null },
      unknownCostAcknowledgedAt: new Date().toISOString(),
    });
    await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${direct.id}::uuid`;
    const query = vi.spyOn(queue, 'deliveryState').mockRejectedValueOnce(new Error('查询失败'));
    await expect(worker.reconcile()).rejects.toThrow('查询失败');
    query.mockRestore();
    expect((await operations.read(alice.principal.id, direct.id)).deliveryAttempts).toBe(0);
    expect(providerCalls).toBe(2);
    await request(
      `/strategy-authoring/operations/${direct.id}/cancel`,
      400,
      { ownerId: bob.principal.id },
      alice.token,
    );
    const cancelled = await request(
      `/strategy-authoring/operations/${direct.id}/cancel`,
      201,
      {},
      alice.token,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.outcome).toMatchObject({ attempt: 0, externalResult: 'not_sent' });
    const exhausted = await operations.submit(alice.principal.id, draftId, {
      ...direct.input.selection,
      idempotencyKey: 'bounded-redelivery',
    });
    const enqueue = vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('受控投递失败'));
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${exhausted.id}::uuid`;
      await expect(worker.reconcile()).rejects.toThrow('受控投递失败');
    }
    enqueue.mockRestore();
    await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${exhausted.id}::uuid`;
    await worker.reconcile();
    const terminal = await operations.read(alice.principal.id, exhausted.id);
    expect(terminal.deliveryAttempts).toBe(2);
    expect(terminal.status).toBe('failed');
    expect(terminal.outcome).toMatchObject({
      attempt: 0,
      externalResult: 'not_sent',
      errorCode: 'AUTHORING_DELIVERY_EXHAUSTED',
    });
    expect(providerCalls).toBe(2);
  });
  it('未知费用必须明确确认并绑定所选模型，调用后仍保留未知而不变成零', async () => {
    pricesKnown = false;
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      400,
      selection('unknown-rejected'),
      alice.token,
    );
    expect(await operations.findIntent(alice.principal.id, draftId, 'unknown-rejected')).toBeNull();
    const acknowledged = {
      ...selection('unknown-acknowledged'),
      unknownCostAcknowledgedAt: new Date().toISOString(),
    };
    const submitted = await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      201,
      acknowledged,
      alice.token,
    );
    const finished = await observe(submitted.id as string);
    expect(finished.status).toBe('succeeded');
    expect(providerCalls).toBe(3);
    expect(finished.outcome).toMatchObject({
      cost: { status: 'unknown', amount: null, currency: null, source: null },
    });
    expect(finished.input).toMatchObject({
      selection: {
        model: 'selected-authoring-model',
        unknownCostAcknowledgedAt: acknowledged.unknownCostAcknowledgedAt,
      },
    });
    await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      409,
      { ...acknowledged, model: 'other-model' },
      alice.token,
    );
    pricesKnown = true;
  });
  it('两个执行器同时读到排队状态时，失败领取者不取消已领取者', async () => {
    const original = await operations.findIntent(alice.principal.id, draftId, 'once');
    const submitted = await operations.submit(alice.principal.id, draftId, {
      ...original!.input.selection,
      idempotencyKey: 'concurrent-executors',
    });
    const read = operations.lookupForExecution.bind(operations);
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    const lookup = vi.spyOn(operations, 'lookupForExecution').mockImplementation(async (id) => {
      const value = await read(id);
      if (++arrivals === 2) release();
      await barrier;
      return value;
    });
    try {
      await Promise.all([execution.execute(submitted.id), execution.execute(submitted.id)]);
    } finally {
      lookup.mockRestore();
    }
    const finished = await operations.read(alice.principal.id, submitted.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.attempt).toBe(1);
    expect(finished.cancelRequestedAt).toBeNull();
    expect(providerCalls).toBe(4);
  });
  it('三个用途通过同一独立队列，模型变更与超大输出明确失败且不重试', async () => {
    const definition = authoringStrategySchema.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    for (const kind of ['generate', 'modify'] as const) {
      const content = {
        ...blank,
        definitionText: kind === 'modify' ? JSON.stringify(definition) : '',
        requirements: [
          {
            id: 'rule',
            quote: blank.description,
            interpretation: '受控明确要求',
            state: 'understood',
            definitionPaths: [],
          },
        ],
        confirmation: {
          instrumentId,
          instrument: definition.executionInstrument,
          timeframe: definition.primaryTimeframe,
          entrySummary: '夹具入场',
          exitSummary: '夹具退出',
          sizing: definition.sizing,
          risk: definition.risk,
          noExtraRiskConfirmed: true,
          execution: definition.execution,
          cost: definition.cost,
          periodsAreBarsConfirmed: true,
        },
      };
      const independent = await request('/strategy-authoring/drafts', 201, content, alice.token);
      output = {
        definition:
          kind === 'modify'
            ? { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] }
            : definition,
        coverage: [{ requirementId: 'rule', definitionPaths: ['entry'] }],
      };
      const submitted = await request(
        `/strategy-authoring/drafts/${independent.id as string}/operations`,
        201,
        {
          ...selection(`queue-${kind}`),
          kind,
          ...(kind === 'modify'
            ? { intent: '止损改为 3%，其他不变', modificationTarget: 'risk' }
            : {}),
        },
        alice.token,
      );
      expect((await observe(submitted.id as string)).status).toBe('succeeded');
    }
    for (const mode of ['model-mismatch', 'large-output'] as const) {
      const before = providerCalls;
      actualModel = mode === 'model-mismatch' ? 'unexpected-model' : 'selected-authoring-model';
      output = {
        requirements: [],
        questions: [],
        runtimeIntents: mode === 'large-output' ? Array(40).fill('x'.repeat(2000)) : [],
      };
      const submitted = await request(
        `/strategy-authoring/drafts/${draftId}/operations`,
        201,
        selection(mode),
        alice.token,
      );
      const failed = await observe(submitted.id as string);
      expect(failed.status).toBe('failed');
      expect(providerCalls).toBe(before + 1);
      expect(failed.outcome).toMatchObject({
        externalResult: 'received',
        errorCode:
          mode === 'model-mismatch' ? 'AUTHORING_MODEL_MISMATCH' : 'AUTHORING_OUTPUT_TOO_LARGE',
      });
      const facts = (
        failed.invocations as Array<{ facts: Array<{ details: { actualModel: string } }> }>
      )[0]!.facts;
      expect(facts.at(-1)!.details.actualModel).toBe(actualModel);
    }
    actualModel = 'selected-authoring-model';
    output = { requirements: [], questions: [], runtimeIntents: [] };
  });
  it('在途取消和过期后的晚到响应保留收到事实，不覆盖终态或再收费', async () => {
    for (const mode of ['cancel', 'expire'] as const) {
      const before = providerCalls;
      let release!: () => void;
      heldResponse = new Promise<void>((resolveResponse) => {
        release = resolveResponse;
      });
      const submitted = await request(
        `/strategy-authoring/drafts/${draftId}/operations`,
        201,
        selection(`held-${mode}`),
        alice.token,
      );
      try {
        for (let step = 0; providerCalls === before && step < 100; step++)
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        expect(providerCalls).toBe(before + 1);
        if (mode === 'cancel')
          await request(
            `/strategy-authoring/operations/${submitted.id}/cancel`,
            201,
            {},
            alice.token,
          );
        else {
          await db.$executeRaw`UPDATE "StrategyAuthoringOperation" SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${submitted.id as string}::uuid`;
          await worker.reconcile();
        }
      } finally {
        release();
        heldResponse = undefined;
      }
      let finished = await observe(submitted.id as string);
      for (let step = 0; step < 100; step++) {
        const invocation = (finished.invocations as Array<{ facts: Array<{ kind: string }> }>)[0];
        if (invocation?.facts.at(-1)?.kind === 'received') break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        finished = await request(
          `/strategy-authoring/operations/${submitted.id}`,
          200,
          undefined,
          alice.token,
        );
      }
      const facts = (
        finished.invocations as Array<{ facts: Array<{ kind: string }> }>
      )[0]!.facts.map((fact) => fact.kind);
      expect(finished.status).toBe(mode === 'cancel' ? 'cancelled' : 'failed');
      expect(facts).toEqual(
        mode === 'cancel' ? ['dispatching', 'received'] : ['dispatching', 'unknown', 'received'],
      );
      expect(finished.outcome).toMatchObject({
        externalResult: mode === 'cancel' ? 'received' : 'unknown',
      });
      expect(providerCalls).toBe(before + 1);
    }
    expect(
      (await request(`/strategy-authoring/drafts/${draftId}`, 200, undefined, alice.token))
        .revision,
    ).toBe(1);
  });
  registerAuthoringAnalysisCases(caseContext);
  it('排队后计价配置变化时拒绝派发，审计明确未发送而不估算已收费', async () => {
    const before = providerCalls;
    const original = await operations.findIntent(alice.principal.id, draftId, 'once');
    const submitted = await operations.submit(alice.principal.id, draftId, {
      ...original!.input.selection,
      expectedRevision: 3,
      idempotencyKey: 'pricing-changed',
    });
    pricesKnown = false;
    try {
      await execution.execute(submitted.id);
    } finally {
      pricesKnown = true;
    }
    const failed = await request(
      `/strategy-authoring/operations/${submitted.id}`,
      200,
      undefined,
      alice.token,
    );
    expect(failed.status).toBe('failed');
    expect(providerCalls).toBe(before);
    expect(failed.outcome).toMatchObject({
      externalResult: 'not_sent',
      errorCode: 'AUTHORING_MODEL_CONFIGURATION_CHANGED',
      usage: null,
      cost: { status: 'unknown', amount: null, currency: null },
    });
    const facts = (failed.invocations as Array<{ facts: Array<{ kind: string }> }>)[0]!.facts;
    expect(facts.map((fact) => fact.kind)).toEqual(['not_sent']);
  });
  registerAuthoringSaveCases(caseContext);
});
