import type { AuthoringExecutionCaseContext } from './authoring-execution.case-context.js';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import 'reflect-metadata';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import type * as AuditRuntime from '../../src/ai/ai-invocation.store.js';
import type * as ProviderRuntime from '../../src/ai/ai-provider.service.js';
import type * as SdkRuntime from '../../src/ai/ai-sdk-generation.adapter.js';
import type * as RegistryRuntime from '../../src/ai/provider-registry.js';
import type * as AccessRuntime from '../../src/backtest/strategy-access.service.js';
import type * as CreationRuntime from '../../src/backtest/strategy-creation.service.js';
import type * as IdentityRuntime from '../../src/identity/identity.module.js';
import type { IdentityService } from '../../src/identity/identity.service.js';
import type * as InstrumentRuntime from '../../src/market/instrument.service.js';
import type * as FilterRuntime from '../../src/platform/api-exception.filter.js';
import type * as SecurityRuntime from '../../src/platform/network-security.js';
import type * as PersistenceRuntime from '../../src/platform/prisma.service.js';
import type * as RedisRuntime from '../../src/platform/redis.service.js';
import type * as AnalysisRuntime from '../../src/strategy-authoring/authoring-analysis.repository.js';
import type * as DraftRuntime from '../../src/strategy-authoring/authoring-draft.repository.js';
import type * as HistoryControllerRuntime from '../../src/strategy-authoring/authoring-operation-history.controller.js';
import type * as HistoryRuntime from '../../src/strategy-authoring/authoring-operation-history.repository.js';
import type * as ControllerRuntime from '../../src/strategy-authoring/authoring-operation.controller.js';
import type * as OperationRuntime from '../../src/strategy-authoring/authoring-operation.repository.js';
import type * as ProposalControllerRuntime from '../../src/strategy-authoring/authoring-proposal.controller.js';
import type * as ProposalRuntime from '../../src/strategy-authoring/authoring-proposal.service.js';
import type * as SourceRuntime from '../../src/strategy-authoring/authoring-provenance.repository.js';
import type * as QueueRuntime from '../../src/strategy-authoring/authoring-queue.js';
import type * as ResultRuntime from '../../src/strategy-authoring/authoring-result.repository.js';
import type * as SaveControllerRuntime from '../../src/strategy-authoring/authoring-save.controller.js';
import type * as SaveRuntime from '../../src/strategy-authoring/authoring-save.service.js';
import type * as SubmitRuntime from '../../src/strategy-authoring/authoring-submit.service.js';
import type * as ExecutorRuntime from '../../src/strategy-authoring/authoring.executor.js';
import type * as WorkerRuntime from '../../src/strategy-authoring/authoring.worker.js';
import type * as AuthoringRuntime from '../../src/strategy-authoring/strategy-authoring.module.js';

function authoringExecutionContext() {
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
  const provider = createAuthoringProvider({
    get providerCalls() {
      return providerCalls;
    },
    set providerCalls(value: number) {
      providerCalls = value;
    },
    modelBodies,
    get heldResponse() {
      return heldResponse;
    },
    get actualModel() {
      return actualModel;
    },
    get output() {
      return output;
    },
  });
  const blank = createBlankAuthoringDraft();
  const selection = createAuthoringSelection();
  const request = createAuthoringHttpRequest({
    get base() {
      return base;
    },
    gateway,
  });
  const observe = createAuthoringOperationObserver({
    request,
    get alice() {
      return alice;
    },
  });
  const caseContext = (): AuthoringExecutionCaseContext =>
    projectAuthoringCaseContext(fixtureState);
  const fixtureState = {
    get load() {
      return load;
    },
    get app() {
      return app;
    },
    set app(value: typeof app) {
      app = value;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get redis() {
      return redis;
    },
    set redis(value: typeof redis) {
      redis = value;
    },
    get queue() {
      return queue;
    },
    set queue(value: typeof queue) {
      queue = value;
    },
    get worker() {
      return worker;
    },
    set worker(value: typeof worker) {
      worker = value;
    },
    get operations() {
      return operations;
    },
    set operations(value: typeof operations) {
      operations = value;
    },
    get execution() {
      return execution;
    },
    set execution(value: typeof execution) {
      execution = value;
    },
    get base() {
      return base;
    },
    set base(value: typeof base) {
      base = value;
    },
    get alice() {
      return alice;
    },
    set alice(value: typeof alice) {
      alice = value;
    },
    get bob() {
      return bob;
    },
    set bob(value: typeof bob) {
      bob = value;
    },
    get draftId() {
      return draftId;
    },
    set draftId(value: typeof draftId) {
      draftId = value;
    },
    get instrumentId() {
      return instrumentId;
    },
    set instrumentId(value: typeof instrumentId) {
      instrumentId = value;
    },
    get sources() {
      return sources;
    },
    set sources(value: typeof sources) {
      sources = value;
    },
    get access() {
      return access;
    },
    set access(value: typeof access) {
      access = value;
    },
    get password() {
      return password;
    },
    get gateway() {
      return gateway;
    },
    get modelReady() {
      return modelReady;
    },
    set modelReady(value: typeof modelReady) {
      modelReady = value;
    },
    get pricesKnown() {
      return pricesKnown;
    },
    set pricesKnown(value: typeof pricesKnown) {
      pricesKnown = value;
    },
    get providerCalls() {
      return providerCalls;
    },
    set providerCalls(value: typeof providerCalls) {
      providerCalls = value;
    },
    get output() {
      return output;
    },
    set output(value: typeof output) {
      output = value;
    },
    get actualModel() {
      return actualModel;
    },
    set actualModel(value: typeof actualModel) {
      actualModel = value;
    },
    get heldResponse() {
      return heldResponse;
    },
    set heldResponse(value: typeof heldResponse) {
      heldResponse = value;
    },
    get modelBodies() {
      return modelBodies;
    },
    get provider() {
      return provider;
    },
    get blank() {
      return blank;
    },
    get selection() {
      return selection;
    },
    get request() {
      return request;
    },
    get observe() {
      return observe;
    },
    get caseContext() {
      return caseContext;
    },
  };
  beforeAll(async () => {
    await initializeAuthoringExecutionFixture(fixtureState);
  }, 30_000);
  afterAll(async () => {
    await releaseAuthoringExecutionFixture(fixtureState);
  });
  return fixtureState;
}

async function initializeAuthoringExecutionFixture(
  lifecycleScope: ReturnType<typeof authoringExecutionContext>,
): Promise<void> {
  const { address, modules } = await connectAuthoringExecutionFixture(lifecycleScope);
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
  const redisService = {
    client: lifecycleScope.redis,
    ping: () => lifecycleScope.redis.ping(),
  } as RedisRuntime.RedisService;
  const providerService = {
    refreshRegistry: vi.fn(async () => undefined),
  } as unknown as ProviderRuntime.AiProviderService;
  const registry = {
    strictReadyContract: ({ contract }: { contract: unknown }) => {
      if (!lifecycleScope.modelReady) throw new Error('受控路由未就绪');
      return {
        provider: {
          id: 'controlled-authoring',
          models: ['selected-authoring-model'],
          metadata: {
            modelPricing: {
              'selected-authoring-model': lifecycleScope.pricesKnown
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
  lifecycleScope.operations = new operation.AuthoringOperationRepository(lifecycleScope.db);
  const drafts = new draft.AuthoringDraftRepository(lifecycleScope.db);
  const audit = new auditModule.AiInvocationStore(lifecycleScope.db as never);
  const sdk = new sdkModule.AiSdkGenerationAdapter();
  lifecycleScope.queue = new queueModule.AuthoringQueue(redisService);
  lifecycleScope.execution = new executor.AuthoringExecutor(
    lifecycleScope.operations,
    providerService,
    registry,
    audit,
    sdk,
  );
  lifecycleScope.worker = new workerModule.AuthoringWorker(
    redisService,
    lifecycleScope.queue,
    lifecycleScope.operations,
    lifecycleScope.execution,
    audit,
  );
  const instruments = new instrumentModule.InstrumentService(lifecycleScope.db as never);
  lifecycleScope.instrumentId = (
    await lifecycleScope.db.instrument.create({
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
    lifecycleScope.operations,
    lifecycleScope.queue,
    providerService,
    registry,
    instruments,
  );
  lifecycleScope.sources = new sourceModule.AuthoringProvenanceRepository(lifecycleScope.db);
  lifecycleScope.access = new accessModule.StrategyAccessService(lifecycleScope.db as never);
  const saves = new saveModule.AuthoringSaveService(
    lifecycleScope.db as never,
    new creationModule.StrategyCreationService(),
    lifecycleScope.sources,
    instruments,
  );
  class FixturePersistence {}
  Global()(FixturePersistence);
  Module({
    providers: [{ provide: persistence.PrismaService, useValue: lifecycleScope.db }],
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
      { provide: operation.AuthoringOperationRepository, useValue: lifecycleScope.operations },
      { provide: submit.AuthoringSubmitService, useValue: submissions },
      { provide: auditModule.AiInvocationStore, useValue: audit },
      {
        provide: analysisModule.AuthoringAnalysisRepository,
        useValue: new analysisModule.AuthoringAnalysisRepository(lifecycleScope.db, drafts),
      },
      {
        provide: resultModule.AuthoringResultRepository,
        useValue: new resultModule.AuthoringResultRepository(lifecycleScope.db, drafts),
      },
      { provide: sourceModule.AuthoringProvenanceRepository, useValue: lifecycleScope.sources },
      { provide: saveModule.AuthoringSaveService, useValue: saves },
      {
        provide: proposalModule.AuthoringProposalService,
        useValue: new proposalModule.AuthoringProposalService(
          lifecycleScope.db,
          lifecycleScope.operations,
          lifecycleScope.sources,
          drafts,
        ),
      },
      {
        provide: historyModule.AuthoringOperationHistoryRepository,
        useValue: new historyModule.AuthoringOperationHistoryRepository(lifecycleScope.db),
      },
    ],
  })(FixtureApplication);
  lifecycleScope.app = await NestFactory.create(FixtureApplication, { logger: false });
  lifecycleScope.app.use(security.createLanAuthMiddleware(lifecycleScope.gateway));
  lifecycleScope.app.useGlobalFilters(new filter.ApiExceptionFilter());
  lifecycleScope.app.setGlobalPrefix('api/v1');
  await lifecycleScope.app.listen(0, '127.0.0.1');
  lifecycleScope.base = `${await lifecycleScope.app.getUrl()}/api/v1`;
  await lifecycleScope.worker.start();
  lifecycleScope.alice = (await lifecycleScope.request('/identity/users', 201, {
    username: 'authoring.alice',
    password: lifecycleScope.password,
    displayName: '编写用户甲',
  })) as unknown as typeof lifecycleScope.alice;
  lifecycleScope.bob = (await lifecycleScope.request('/identity/users', 201, {
    username: 'authoring.bob',
    password: lifecycleScope.password,
    displayName: '编写用户乙',
  })) as unknown as typeof lifecycleScope.bob;
  lifecycleScope.draftId = (
    await lifecycleScope.request(
      '/strategy-authoring/drafts',
      201,
      lifecycleScope.blank,
      lifecycleScope.alice.token,
    )
  ).id as string;
}

async function releaseAuthoringExecutionFixture(
  lifecycleScope: ReturnType<typeof authoringExecutionContext>,
): Promise<void> {
  await lifecycleScope.worker?.onModuleDestroy();
  await lifecycleScope.queue?.onModuleDestroy();
  await lifecycleScope.app?.close();
  await lifecycleScope.redis?.quit();
  await lifecycleScope.db?.$disconnect();
  lifecycleScope.provider.close();
  vi.unstubAllEnvs();
}

function createAuthoringHttpRequest(scope: { readonly base: string; readonly gateway: string }) {
  return async (path: string, status: number, body?: unknown, token?: string, method?: 'PATCH') => {
    const response = await fetch(`${scope.base}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        authorization: `Bearer ${scope.gateway}`,
        'content-type': 'application/json',
        ...(token ? { 'x-thesis-ledger-session': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status, path).toBe(status);
    return (await response.json()) as Record<string, unknown>;
  };
}

function createAuthoringProvider(scope: {
  providerCalls: number;
  modelBodies: Array<{ model: string }>;
  readonly heldResponse: Promise<void> | undefined;
  readonly actualModel: string;
  readonly output: unknown;
}) {
  return createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    scope.providerCalls += 1;
    scope.modelBodies.push(JSON.parse(Buffer.concat(chunks).toString()) as { model: string });
    await scope.heldResponse;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const frame = (extra: Record<string, unknown>) => ({
      id: 'controlled-authoring',
      object: 'chat.completion.chunk',
      created: 1,
      model: scope.actualModel,
      ...extra,
    });
    response.write(
      `data: ${JSON.stringify(frame({ choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify(scope.output) }, finish_reason: null }] }))}\n\n`,
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
}

function createBlankAuthoringDraft() {
  return {
    title: '隔离编写验收',
    description: '验证单一受控模型',
    questions: [],
    requirements: [],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: '',
    manualChanges: [],
  };
}

function createAuthoringSelection() {
  return (idempotencyKey: string) => ({
    kind: 'analyze',
    expectedRevision: 1,
    idempotencyKey,
    providerId: 'controlled-authoring',
    model: 'selected-authoring-model',
    intent: '',
    unknownCostAcknowledgedAt: null,
  });
}

async function connectAuthoringExecutionFixture(
  lifecycleScope: ReturnType<typeof authoringExecutionContext>,
) {
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
  lifecycleScope.db = new PrismaClient({ datasourceUrl: url.toString() });
  await lifecycleScope.db.$connect();
  lifecycleScope.redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 1 });
  lifecycleScope.redis.on('error', () => undefined);
  await lifecycleScope.redis.ping();
  lifecycleScope.provider.listen(0, '127.0.0.1');
  await once(lifecycleScope.provider, 'listening');
  const address = lifecycleScope.provider.address();
  if (!address || typeof address === 'string') throw new Error('受控 Provider 启动失败');
  const modules = await Promise.all([
    lifecycleScope.load<typeof IdentityRuntime>('identity/identity.module.js'),
    lifecycleScope.load<typeof PersistenceRuntime>('platform/prisma.service.js'),
    lifecycleScope.load<typeof FilterRuntime>('platform/api-exception.filter.js'),
    lifecycleScope.load<typeof SecurityRuntime>('platform/network-security.js'),
    lifecycleScope.load<typeof AuthoringRuntime>('strategy-authoring/strategy-authoring.module.js'),
    lifecycleScope.load<typeof DraftRuntime>('strategy-authoring/authoring-draft.repository.js'),
    lifecycleScope.load<typeof OperationRuntime>(
      'strategy-authoring/authoring-operation.repository.js',
    ),
    lifecycleScope.load<typeof SubmitRuntime>('strategy-authoring/authoring-submit.service.js'),
    lifecycleScope.load<typeof ControllerRuntime>(
      'strategy-authoring/authoring-operation.controller.js',
    ),
    lifecycleScope.load<typeof ExecutorRuntime>('strategy-authoring/authoring.executor.js'),
    lifecycleScope.load<typeof WorkerRuntime>('strategy-authoring/authoring.worker.js'),
    lifecycleScope.load<typeof QueueRuntime>('strategy-authoring/authoring-queue.js'),
    lifecycleScope.load<typeof AuditRuntime>('ai/ai-invocation.store.js'),
    lifecycleScope.load<typeof SdkRuntime>('ai/ai-sdk-generation.adapter.js'),
    lifecycleScope.load<typeof AnalysisRuntime>(
      'strategy-authoring/authoring-analysis.repository.js',
    ),
    lifecycleScope.load<typeof ResultRuntime>('strategy-authoring/authoring-result.repository.js'),
    lifecycleScope.load<typeof InstrumentRuntime>('market/instrument.service.js'),
    lifecycleScope.load<typeof SaveRuntime>('strategy-authoring/authoring-save.service.js'),
    lifecycleScope.load<typeof SaveControllerRuntime>(
      'strategy-authoring/authoring-save.controller.js',
    ),
    lifecycleScope.load<typeof SourceRuntime>(
      'strategy-authoring/authoring-provenance.repository.js',
    ),
    lifecycleScope.load<typeof CreationRuntime>('backtest/strategy-creation.service.js'),
    lifecycleScope.load<typeof AccessRuntime>('backtest/strategy-access.service.js'),
    lifecycleScope.load<typeof ProposalRuntime>('strategy-authoring/authoring-proposal.service.js'),
    lifecycleScope.load<typeof ProposalControllerRuntime>(
      'strategy-authoring/authoring-proposal.controller.js',
    ),
    lifecycleScope.load<typeof HistoryRuntime>(
      'strategy-authoring/authoring-operation-history.repository.js',
    ),
    lifecycleScope.load<typeof HistoryControllerRuntime>(
      'strategy-authoring/authoring-operation-history.controller.js',
    ),
  ]);
  return { address, modules };
}

export { authoringExecutionContext };

function projectAuthoringCaseContext(
  state: AuthoringExecutionCaseContext,
): AuthoringExecutionCaseContext {
  return {
    get output() {
      return state.output;
    },
    set output(value: unknown) {
      state.output = value;
    },
    get providerCalls() {
      return state.providerCalls;
    },
    request: state.request,
    observe: state.observe,
    selection: state.selection,
    alice: state.alice,
    bob: state.bob,
    draftId: state.draftId,
    operations: state.operations,
    db: state.db,
    blank: state.blank,
    modelBodies: state.modelBodies,
    instrumentId: state.instrumentId,
    sources: state.sources,
    access: state.access,
  };
}

function createAuthoringOperationObserver(scope: {
  request: AuthoringExecutionCaseContext['request'];
  readonly alice: { token: string };
}) {
  return async (id: string) => {
    for (let step = 0; step < 100; step++) {
      const result = await scope.request(
        `/strategy-authoring/operations/${id}`,
        200,
        undefined,
        scope.alice.token,
      );
      if (!['queued', 'running'].includes(result.status as string)) return result;
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
    }
    throw new Error('隔离编写未收敛');
  };
}
