import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createSourceFaultRelay, sourceFaultModel } from './research-source-fault-relay.mjs';
import { createSourceFaultControlled } from './research-source-fault-controlled.mjs';
import { createSourceFaultHarness } from './research-source-fault-harness.mjs';

export function assertSourceFaultIsolation(packet) {
  assert(['controlled', 'live'].includes(packet.mode));
  assert.match(packet.containerName, /^ledger-research-source-fault-[a-f0-9]{8}$/);
  const url = new URL(packet.isolatedUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, packet.containerName);
  assert.equal(url.pathname, '/research_source_fault_fixture');
  assert.equal(url.username, 'fixture_owner');
  assert.equal(packet.scope.start, '2026-10-24');
  assert.equal(packet.scope.end, '2026-10-31');
  if (packet.mode === 'live') {
    assert.equal(packet.scope.authorized, true);
    assert(Date.parse(packet.scope.validUntil) > Date.now());
    assert.equal(packet.scope.providerId, 'hithink');
    assert.equal(packet.scope.upstreamSource, 'hithink-news-stock-timeline');
    assert.equal(packet.scope.symbol, '600519.SH');
  }
}

export async function runSourceFaultRuntime(packet, directory) {
  assertSourceFaultIsolation(packet);
  const require = createRequire(join(packet.appRoot, 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const load = (file) => require(join(packet.appRoot, 'dist/src', `${file}.js`));
  const prisma = new PrismaClient({ datasources: { db: { url: packet.isolatedUrl } } });
  const proof = {
    mode: packet.mode,
    startedAt: new Date().toISOString(),
    realModelCalls: 0,
    stages: [],
    events: [],
  };
  const modules = [
    'research/research-submission.service',
    'research/research-preparation-budget',
    'research/research-public-evidence',
    'research/research-price-material',
    'market/market-news-reader',
    'integration/dsa/dsa-news-v3',
    'integration/dsa/dsa.client',
    'ai/ai-research-execution-v2',
    'ai/ai-research-sdk-execution',
    'ai/ai-sdk-generation.adapter',
    'ai/ai-research-sdk-contract',
    'ai/provider-registry',
    'ai/ai-routing-settings.service',
    'research/research.controller',
    'research/research-reports.controller',
    'ai/ai-research-reports.query',
    'identity/identity.guard',
    'ai/ai-execution-state.store',
    'ai/ai-run.service',
    'market/instrument.service',
    'ai/provider-adapters',
  ];
  const save = () =>
    writeFileSync(join(directory, 'proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
  const stage = (name) => {
    proof.stages.push({ name, at: new Date().toISOString() });
    save();
    process.stdout.write(`${name}\n`);
  };
  let upstream, relay, harness;
  let apiKey = '';
  try {
    proof.productionModules = Object.fromEntries(
      modules.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(packet.appRoot, 'dist/src', `${name}.js`)))
          .digest('hex'),
      ]),
    );
    const identity = await prisma.$queryRawUnsafe(
      'SELECT current_database() AS database,current_user AS role',
    );
    assert.deepEqual(identity, [
      { database: 'research_source_fault_fixture', role: 'fixture_owner' },
    ]);
    assert.equal(Number(process.env.AI_RESEARCH_PREPARATION_TIMEOUT_MS ?? 30000), 30000);
    let instrument, aiBase, dsaConfig;
    if (packet.mode === 'live') {
      const source = new PrismaClient();
      try {
        const selected = await source.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          const rows = await tx.$queryRawUnsafe(
            'SELECT current_database() AS database,current_user AS role',
          );
          assert.deepEqual(rows, [{ database: 'thesis_ledger', role: 'thesis_ledger_app' }]);
          return {
            provider: await tx.providerConfig.findUniqueOrThrow({ where: { name: 'cloudflare' } }),
            instrument: await tx.instrument.findFirstOrThrow({
              where: {
                market: 'SH',
                instrumentType: 'STOCK',
                canonicalCode: { in: ['600519', '600519.SH'] },
                active: true,
              },
              select: {
                id: true,
                market: true,
                instrumentType: true,
                canonicalCode: true,
                displayName: true,
                generation: true,
                active: true,
              },
            }),
          };
        });
        const settings = selected.provider.settings;
        assert(settings.models.includes(sourceFaultModel));
        assert.equal(settings.authMode, 'api_key');
        assert.equal(settings.upstreamFormat, 'chat-completions');
        assert.equal(settings.chatImplementation, 'compatible');
        aiBase = settings.baseUrl;
        assert.equal(new URL(aiBase).origin, 'https://api.cloudflare.com');
        assert.match(new URL(aiBase).pathname, /^\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/);
        const cipherHash = createHash('sha256')
          .update(selected.provider.encryptedCredentials)
          .digest('hex');
        assert.equal(cipherHash, packet.scope.cloudflareCredentialCipherHash);
        assert.equal(packet.scope.gatewayBillingMode, 'postpaid');
        apiKey = load('platform/credential-security').normalizeProviderCredential(
          selected.provider.encryptedCredentials,
        ).credential;
        assert(apiKey);
        instrument = selected.instrument;
        dsaConfig = load('platform/config').loadConfig();
        proof.source = {
          cloudflareCredentialCipherHash: cipherHash,
          provider: 'cloudflare',
          model: sourceFaultModel,
          credentialExported: false,
          targetDefaultChanged: false,
          targetConfigurationChanged: false,
        };
      } finally {
        await source.$disconnect();
      }
    } else {
      upstream = await createSourceFaultControlled(
        packet.fixtures.generation,
        packet.fixtures.news,
      );
      aiBase = upstream.origin;
      dsaConfig = {
        dsaBaseUrl: upstream.origin,
        dsaTimeoutMs: 120000,
        dsaToken: 'controlled-data-token',
      };
      instrument = {
        id: randomUUID(),
        canonicalCode: '600519',
        instrumentType: 'STOCK',
        market: 'SH',
        displayName: '受控公开标的',
        generation: 1,
        active: true,
      };
    }
    assert.equal(dsaConfig.dsaTimeoutMs, 120000);
    await prisma.instrument.create({ data: instrument });
    relay = await createSourceFaultRelay({
      dsaBase: dsaConfig.dsaBaseUrl,
      aiBase,
      scope: packet.scope,
      live: packet.mode === 'live',
      validateNews: load('integration/dsa/dsa-news-v3').parseNewsResponseV3,
      onEvent: (event) => {
        proof.events.push(event);
        if (event.kind === 'ai-dispatch') proof.realModelCalls = packet.mode === 'live' ? 1 : 0;
        save();
      },
    });
    harness = await createSourceFaultHarness({
      appRoot: packet.appRoot,
      prisma,
      relay,
      apiKey,
      live: packet.mode === 'live',
      dsaConfig,
    });
    const input = () => ({
      version: 2,
      submissionId: randomUUID(),
      mode: 'actual',
      scope: { scope: 'instrument', instrumentId: instrument.id },
      templateId: 'primary-risks',
      question:
        '只根据当前价格材料给出一个有证据支持的风险断言并引用其字段；明确新闻传输失败，不能推测新闻内容。数字必须逐字来自材料，未知保持未知。',
      researchSettingsRevision: harness.settings.revision,
    });
    stage('准备截止样本开始：模型预算0');
    const started = performance.now();
    const timeoutResponse = await harness.post(input());
    const timeoutBody = await timeoutResponse.json();
    const durationMs = performance.now() - started;
    proof.timeout = {
      httpStatus: timeoutResponse.status,
      durationMs,
      body: timeoutBody,
      aiRunCount: await prisma.aiRun.count(),
      toolCount: await prisma.aiToolCall.count(),
      aiRequests: relay.counts.ai,
    };
    save();
    assert(timeoutResponse.status >= 400);
    assert(JSON.stringify(timeoutBody).includes('RESEARCH_PREPARATION_TIMEOUT'));
    assert(durationMs >= 29900 && durationMs < 40000);
    assert.equal(proof.timeout.aiRunCount, 0);
    assert.equal(proof.timeout.toolCount, 0);
    assert.equal(relay.counts.ai, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert(
      proof.events.some(
        (event) => event.scenario === 'timeout' && event.kind === 'news-upstream-complete',
      ),
    );
    stage('准备截止样本通过，开始部分材料样本');
    relay.setScenario('partial');
    const partialResponse = await harness.post(input());
    const partialBody = await partialResponse.json();
    proof.partialSubmission = { httpStatus: partialResponse.status, body: partialBody };
    save();
    assert.equal(partialResponse.status, 200);
    const before = await prisma.aiRun.findUniqueOrThrow({ where: { id: partialBody.runId } });
    const frozen = before.modelMetadata.frozenResearch;
    proof.frozen = frozen;
    save();
    assert.equal(frozen.evidence.find((entry) => entry.audit.kind === 'quote')?.usable, true);
    const missing = frozen.evidence.find((entry) => entry.audit.kind === 'news');
    assert.equal(missing?.usable, false);
    assert.equal(missing.status, 'unavailable');
    assert(missing.reasons.some((reason) => reason.startsWith('news_')));
    assert.equal(before.modelMetadata.sdkExecution.frozenPolicy.maxAiCalls, 1);
    assert.equal(before.modelMetadata.sdkExecution.frozenPolicy.maxCost, '0');
    assert.equal(relay.counts.ai, 0);
    stage('冻结材料已核对，单次SDK请求开始');
    await harness.execute(before.id);
    const row = await prisma.aiRun.findUniqueOrThrow({ where: { id: before.id } });
    const tools = await prisma.aiToolCall.findMany({ where: { aiRunId: row.id } });
    proof.run = row;
    proof.tools = tools;
    save();
    assert.equal(row.status, 'succeeded');
    const result = harness.schemas.researchResultV2Schema.parse(row.result);
    assert.equal(result.quality.status, 'partial');
    assert(result.quality.reasons.some((reason) => reason.startsWith('news_')));
    assert.equal(result.evidenceBindings.length, 1);
    assert(result.evidenceBindings.every((binding) => binding.audit.kind === 'quote'));
    assert.equal(tools.length, 1);
    assert.equal(tools[0].status, 'ok');
    assert(result.inference.claims.length > 0 && result.inference.numericClaims.length > 0);
    assert.equal(relay.counts.ai, 1);
    assert.equal(relay.counts.news, 2);
    assert.equal(row.modelMetadata.sdkExecution.requests.length, 1);
    const detailResponse = await harness.get(`/${row.id}`);
    const detail = harness.schemas.researchReportDetailSchema.parse(await detailResponse.json());
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.availability, 'available');
    assert.deepEqual(detail.result, result);
    const reference = result.evidenceBindings[0];
    const evidenceResponse = await harness.get(`/${row.id}/evidence/${reference.audit.evidenceId}`);
    const evidence = await evidenceResponse.json();
    assert.equal(evidenceResponse.status, 200);
    assert.equal(evidence.toolCallId, reference.toolCallId);
    assert.deepEqual(evidence.evidence.audit, reference.audit);
    const requestsBeforeRead = { ...relay.counts };
    const toolsResponse = await harness.get(`/${row.id}/tool-calls`);
    assert.equal(toolsResponse.status, 200);
    proof.http = { detail, evidence, tools: await toolsResponse.json() };
    assert.deepEqual(relay.counts, requestsBeforeRead);
    proof.status = 'passed';
    stage('实际HTTP/SDK/持久化与引用反读通过');
  } catch (error) {
    proof.status = 'failed';
    proof.error = {
      name: error.name,
      message: String(error.message).replaceAll(apiKey || '\u0000', '[已脱敏]'),
    };
    throw error;
  } finally {
    proof.completedAt = new Date().toISOString();
    proof.counts = relay ? { ...relay.counts } : { ai: 0, news: 0 };
    proof.databaseRows = await prisma.aiRun.findMany().catch(() => null);
    proof.databaseTools = await prisma.aiToolCall.findMany().catch(() => null);
    save();
    await harness?.close();
    await relay?.close();
    await upstream?.close();
    await prisma.$disconnect();
  }
  return proof;
}
