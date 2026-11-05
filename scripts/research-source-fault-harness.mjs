import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { sourceFaultModel } from './research-source-fault-relay.mjs';

export async function createSourceFaultHarness({
  appRoot,
  prisma,
  relay,
  apiKey,
  live,
  dsaConfig,
}) {
  const require = createRequire(join(appRoot, 'package.json'));
  require('reflect-metadata');
  const load = (file) => require(join(appRoot, 'dist/src', `${file}.js`));
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const schemas = require('@thesis-ledger/schemas');
  const { AiProviderRegistry } = load('ai/provider-registry');
  const { OpenAiCompatibleProvider } = load('ai/provider-adapters');
  const { AiRoutingSettingsService } = load('ai/ai-routing-settings.service');
  const { AiRunService } = load('ai/ai-run.service');
  const { AiExecutionStateStore } = load('ai/ai-execution-state.store');
  const { AiResearchSdkExecution } = load('ai/ai-research-sdk-execution');
  const { AiSdkGenerationAdapter } = load('ai/ai-sdk-generation.adapter');
  const { AiResearchExecutor } = load('ai/ai-research.executor');
  const { PromptVersionRegistry } = load('ai/prompt-registry');
  const { researchPromptsV2 } = load('ai/ai-research-prompts-v2');
  const { DsaClient } = load('integration/dsa/dsa.client');
  const { MarketService } = load('market/market.service');
  const { MarketNewsReader } = load('market/market-news-reader');
  const { InstrumentService } = load('market/instrument.service');
  const { ResearchScopeReader } = load('research/research-scope-reader');
  const { ResearchSubmissionService } = load('research/research-submission.service');
  const { ResearchController } = load('research/research.controller');
  const { ResearchReportsController } = load('research/research-reports.controller');
  const { AiResearchReportsQuery } = load('ai/ai-research-reports.query');
  const { PrismaService } = load('platform/prisma.service');
  const { ApiExceptionFilter } = load('platform/api-exception.filter');
  const { IdentityService, IDENTITY_SESSION_HEADER } = load('identity/identity.service');
  const { IdentityGuard } = load('identity/identity.guard');
  process.env.AI_RESEARCH_V2_WRITES_ENABLED = 'true';
  process.env.AI_RESEARCH_POLICY_JSON = JSON.stringify({
    ...schemas.DEFAULT_AI_RESEARCH_POLICY_V1,
    maxAiCalls: 1,
    maxCost: '0',
    maxDurationSeconds: 600,
  });
  const defaults = {
    requestOptions: {
      body: { chat_template_kwargs: { enable_thinking: false } },
      headers: {
        'cf-aig-gateway-id': 'default',
        'cf-aig-collect-log': 'true',
        'cf-aig-collect-log-payload': 'true',
      },
      outputTokenLimit: 'upstream',
    },
  };
  const registry = new AiProviderRegistry();
  registry.register(
    new OpenAiCompatibleProvider(
      'cloudflare',
      [sourceFaultModel],
      `${relay.origin}/cloudflare/v1`,
      apiKey,
      120000,
      {
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'USD',
        pricingVersion: 'workers-free-acceptance-20261031',
      },
      {
        source: 'database',
        authMode: live ? 'api_key' : 'none',
        health: 'unknown',
        adapter: 'openai-compatible',
        upstreamFormat: 'chat-completions',
        chatImplementation: 'compatible',
        ...(apiKey
          ? { credentialFingerprint: createHash('sha256').update(apiKey).digest('hex') }
          : {}),
        executionRoutes: [
          {
            model: sourceFaultModel,
            contract: schemas.researchGenerationV2Contract.ref,
            mode: 'json_mode',
            enabled: true,
            outputPolicy: 'manual',
            modeOverridden: true,
          },
        ],
        modelDefaults: { [sourceFaultModel]: defaults },
      },
    ),
  );
  const routing = new AiRoutingSettingsService(prisma);
  const settings = await routing.update({
    researchDefault: { providerId: 'cloudflare', model: sourceFaultModel },
    expectedRevision: '0',
  });
  const runs = new AiRunService(prisma, registry, routing);
  const state = new AiExecutionStateStore(prisma);
  const sdk = new AiResearchSdkExecution(registry, new AiSdkGenerationAdapter(), state);
  const prompts = new PromptVersionRegistry();
  for (const prompt of researchPromptsV2) prompts.register(prompt);
  const executor = new AiResearchExecutor(runs, prisma, registry, prompts, state, sdk);
  const dsa = Object.assign(Object.create(DsaClient.prototype), {
    config: { ...dsaConfig, dsaBaseUrl: relay.origin },
  });
  const redis = {
    client: {
      get: async () => null,
      set: async () => 'OK',
      eval: async () => 1,
      multi: () => {
        const chain = { set: () => chain, exec: async () => [] };
        return chain;
      },
    },
  };
  const market = new MarketService(dsa, redis, prisma);
  const news = new MarketNewsReader(dsa);
  const scopes = new ResearchScopeReader(prisma, new InstrumentService(prisma));
  const identities = new IdentityService(prisma);
  const session = await identities.register({
    username: `rf_${randomUUID().slice(0, 12)}`,
    displayName: '来源故障隔离验收',
    password: randomBytes(24).toString('base64url'),
  });
  const dispatched = [];
  const dispatch = {
    dispatch: (id) => dispatched.push(id),
    cancelActive: () => {},
    capabilities: () => ({ canStart: true }),
  };
  Reflect.defineMetadata('design:paramtypes', [IdentityService], IdentityGuard);
  class IsolatedResearchModule {}
  Module({
    controllers: [ResearchController, ResearchReportsController],
    providers: [
      ResearchSubmissionService,
      AiResearchReportsQuery,
      { provide: AiRunService, useValue: runs },
      { provide: AiResearchExecutor, useValue: dispatch },
      { provide: ResearchScopeReader, useValue: scopes },
      { provide: PromptVersionRegistry, useValue: prompts },
      { provide: MarketService, useValue: market },
      { provide: MarketNewsReader, useValue: news },
      { provide: PrismaService, useValue: prisma },
      { provide: IdentityService, useValue: identities },
      { provide: IdentityGuard, useValue: new IdentityGuard(identities) },
    ],
  })(IsolatedResearchModule);
  const app = await NestFactory.create(IsolatedResearchModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const headers = { 'content-type': 'application/json', [IDENTITY_SESSION_HEADER]: session.token };
  return {
    schemas,
    load,
    settings,
    runs,
    dispatched,
    post: (body) =>
      fetch(`${base}/api/v1/research/submissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    get: (path) =>
      fetch(
        `${base}/api/v1/research/reports${path}${path.includes('?') ? '&' : '?'}view=scoped&mode=actual`,
        { headers },
      ),
    execute: (id) => executor.execute(id),
    close: () => app.close(),
  };
}
