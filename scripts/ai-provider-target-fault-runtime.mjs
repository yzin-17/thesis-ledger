import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTargetFaultRelay } from './ai-provider-target-fault-relay.mjs';
import {
  targetFaultApi,
  targetFaultDraft,
  targetFaultModel,
} from './ai-provider-target-fault-requests.mjs';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modules = [
  'ai/ai-provider.controller',
  'ai/ai-provider.service',
  'ai/ai-provider-save.service',
  'ai/ai-provider-validation-policy',
  'ai/ai-provider-validation-runner',
  'ai/ai-provider-test-pricing',
  'ai/ai-provider-probe-timeout',
  'ai/provider-connection-test',
  'ai/ai-sdk-generation.adapter',
  'ai/timeout/ai-timeout-scope',
];

async function state(prisma) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    assert.deepEqual(
      await tx.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role'),
      [{ database: 'thesis_ledger', role: 'thesis_ledger_app' }],
    );
    const providers = await tx.providerConfig.findMany({ orderBy: { name: 'asc' } });
    const rows = await tx.$queryRawUnsafe(
      'SELECT id::text,md5(to_jsonb(r)::text) AS hash FROM "ProviderHealthCheck" r',
    );
    return {
      providers: providers.map((row) => ({ name: row.name, digest: digest(row) })),
      routing: digest(await tx.aiRoutingSettings.findMany()),
      health: Object.fromEntries(rows.map((r) => [r.id, r.hash])),
      business: {
        aiRuns: await tx.aiRun.count(),
        tools: await tx.aiToolCall.count(),
        strategies: await tx.strategy.count(),
      },
    };
  });
}

async function guard(prisma, row, proof, save) {
  const relay = await createTargetFaultRelay({ scenario: 'guard', limit: 0, live: false });
  try {
    const draft = targetFaultDraft(row, relay.origin, 'synthetic-budget-guard-key', false);
    const original = draft.modelPricing[targetFaultModel];
    assert(original.costPer1kInput > 0 && original.costPer1kOutput > 0);
    proof.guards = [];
    const prices = [
      ['original-positive', original],
      ['input-only-positive', { ...original, costPer1kOutput: 0 }],
      ['output-only-positive', { ...original, costPer1kInput: 0 }],
      ['unknown-pricing', {}],
    ];
    for (const [name, price] of prices) {
      const response = await targetFaultApi('/test', {
        ...draft,
        model: targetFaultModel,
        testKind: 'generation',
        mode: 'json_mode',
        budgetAuthorized: false,
        modelPricing: { ...draft.modelPricing, [targetFaultModel]: price },
        requestId: randomUUID(),
      });
      proof.guards.push({ name, response });
      save();
      assert.equal(response.status, 201);
      assert.equal(response.body.status, 'config_error');
      assert.equal(response.body.errorCode, 'invalid_config');
      assert.match(
        response.body.message,
        name === 'unknown-pricing' ? /费用未知|单价|币种/ : /明确授权/,
      );
    }
    const zeroDraft = targetFaultDraft(row, relay.origin, 'synthetic-budget-guard-key', true);
    delete zeroDraft.modelDefaults[targetFaultModel].requestOptions.outputTokenLimit;
    zeroDraft.executionRoutes = zeroDraft.executionRoutes.slice(0, 1);
    const plan = await targetFaultApi('/validation-plan', zeroDraft);
    proof.zeroPlan = plan;
    assert.equal(plan.status, 201);
    assert.equal(plan.body.maxCalls, 1);
    assert.deepEqual(plan.body.estimatedCosts, [{ currency: 'USD', amount: '0' }]);
    const changed = {
      ...zeroDraft,
      modelPricing: { ...zeroDraft.modelPricing, [targetFaultModel]: original },
    };
    const denied = await targetFaultApi('/test-and-save', {
      provider: changed,
      authorization: {
        operationId: randomUUID(),
        planFingerprint: plan.body.planFingerprint,
        authorized: true,
        maxCalls: 1,
        stopOnFirstFailure: true,
        allowTextFallback: false,
      },
    });
    proof.changedCostDenied = denied;
    assert.equal(denied.status, 409);
    assert.match(JSON.stringify(denied.body), /范围或费用已变化/);
    assert.equal(relay.counts.requests, 0);
    proof.canaryRequests = 0;
    proof.after = await state(prisma);
    assert.deepEqual(proof.after, proof.before);
  } finally {
    await relay.close();
  }
}

async function fault(prisma, row, packet, proof, stage, save) {
  const require = createRequire('/app/apps/server/package.json');
  let key = '';
  let relay;
  try {
    key =
      require('/app/apps/server/dist/src/platform/credential-security.js').normalizeProviderCredential(
        row.encryptedCredentials,
      ).credential;
    assert(key);
    const limit = packet.case === 'deadline' ? 2 : 1;
    relay = await createTargetFaultRelay({
      scenario: packet.case,
      upstreamBase: row.settings.baseUrl,
      limit,
      onEvent: (event) => {
        proof.events.push(event);
        if (event.kind === 'model-dispatch') proof.realModelCalls += 1;
        save();
      },
    });
    const draft = targetFaultDraft(row, relay.origin, key, true);
    const plan = await targetFaultApi('/validation-plan', draft);
    proof.plan = plan;
    save();
    assert.equal(plan.status, 201);
    assert.equal(plan.body.maxCalls, 2);
    assert.equal(plan.body.maxDurationSeconds, 600);
    assert.equal(plan.body.pending.length, 2);
    assert.deepEqual(plan.body.estimatedCosts, [{ currency: 'USD', amount: '0' }]);
    proof.operationId = randomUUID();
    stage('目标计划核对通过，开始所属实源操作');
    const started = performance.now();
    const result = await targetFaultApi('/test-and-save', {
      provider: draft,
      authorization: {
        operationId: proof.operationId,
        planFingerprint: plan.body.planFingerprint,
        authorized: true,
        maxCalls: 2,
        stopOnFirstFailure: true,
        allowTextFallback: false,
      },
    });
    proof.durationMs = performance.now() - started;
    proof.response = result;
    proof.audits = await prisma.providerHealthCheck.findMany({
      where: {
        OR: [
          { id: proof.operationId },
          { details: { path: ['operationId'], equals: proof.operationId } },
        ],
      },
      orderBy: { checkedAt: 'asc' },
    });
    proof.after = await state(prisma);
    save();
    assert.equal(result.status, 400);
    assert(
      !proof.events.some((event) => event.kind === 'relay-rejected'),
      '中继或实源失败，不能代收超时',
    );
    assert.equal(relay.counts.dispatched, limit);
    const failed = proof.audits.filter((audit) => audit.details?.status === 'failed');
    const passed = proof.audits.filter((audit) => audit.details?.status === 'passed');
    assert.equal(failed.length, 1);
    const expected = {
      headers: 'provider_first_output_timeout',
      heartbeat: 'provider_first_output_timeout',
      idle: 'provider_output_idle_timeout',
      deadline: 'task_budget_exhausted',
    }[packet.case];
    assert.equal(failed[0].errorCode, expected);
    assert.equal(passed.length, packet.case === 'deadline' ? 1 : 0);
    assert.equal(failed[0].details.usage.status, 'unknown');
    assert.equal(failed[0].details.cost.status, 'estimated');
    assert.equal(failed[0].details.cost.amount, '0');
    if (packet.case === 'deadline') assert(proof.durationMs >= 594000 && proof.durationMs < 610000);
    else if (packet.case === 'idle') {
      const prefix = proof.events.find((event) => event.kind === 'content-prefix-delivered');
      const closed = proof.events.find((event) => event.kind === 'delivery-closed');
      assert(prefix && closed);
      proof.idleGapMs = Date.parse(closed.at) - Date.parse(prefix.at);
      assert(proof.idleGapMs >= 59000 && proof.idleGapMs < 75000);
    } else assert(proof.durationMs >= 119000 && proof.durationMs < 135000);
    assert.deepEqual(proof.after.providers, proof.before.providers);
    assert.equal(proof.after.routing, proof.before.routing);
    assert.deepEqual(proof.after.business, proof.before.business);
    for (const [id, hash] of Object.entries(proof.before.health))
      assert.equal(proof.after.health[id], hash);
    const added = Object.keys(proof.after.health).filter(
      (id) => !Object.hasOwn(proof.before.health, id),
    );
    assert(
      added.every((id) => proof.audits.some((row) => row.id === id)),
      '新增审计不属于本样本',
    );
    proof.addedAuditIds = added;
    stage('目标超时/审计/禁止保存与原数据保护通过');
  } catch (error) {
    if (proof.operationId && !proof.response) {
      proof.emergencyCancel = await targetFaultApi('/cloudflare/validation/cancel', {
        operationId: proof.operationId,
      }).catch(() => ({ status: 'unknown' }));
    }
    throw new Error(String(error.message).replaceAll(key || '\u0000', '[已脱敏]'));
  } finally {
    await relay?.close();
  }
}

export async function runTargetFaultRuntime(packet, directory) {
  const require = createRequire('/app/apps/server/package.json');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const proof = {
    scenario: packet.case,
    startedAt: new Date().toISOString(),
    realModelCalls: 0,
    stages: [],
    events: [],
  };
  const save = () =>
    writeFileSync(join(directory, 'proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
  const stage = (name) => {
    proof.stages.push({ name, at: new Date().toISOString() });
    save();
    process.stdout.write(name + '\n');
  };
  try {
    proof.productionModules = Object.fromEntries(
      modules.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(`/app/apps/server/dist/src/${name}.js`))
          .digest('hex'),
      ]),
    );
    assert.deepEqual(
      proof.productionModules,
      packet.scope.targetModuleHashes,
      '目标模块输入已变化',
    );
    proof.before = await state(prisma);
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.providerConfig.findUniqueOrThrow({ where: { name: 'cloudflare' } });
    });
    assert.equal(row.enabled, false);
    assert.equal(row.settings.upstreamFormat, 'chat-completions');
    assert.equal(row.settings.chatImplementation, 'compatible');
    assert.equal(row.settings.authMode, 'api_key');
    assert.equal(
      createHash('sha256').update(row.encryptedCredentials).digest('hex'),
      packet.scope.credentialCipherHash,
    );
    assert.equal(row.updatedAt.toISOString(), packet.scope.expectedRevision);
    assert.equal(await prisma.aiRun.count({ where: { status: { in: ['queued', 'running'] } } }), 0);
    stage('目标只读配置/身份/产物核对通过');
    if (packet.case === 'guard') await guard(prisma, row, proof, save);
    else await fault(prisma, row, packet, proof, stage, save);
    proof.status = 'passed';
  } catch (error) {
    proof.status = 'failed';
    proof.error = { name: error.name, message: error.message };
    throw error;
  } finally {
    proof.completedAt = new Date().toISOString();
    save();
    await prisma.$disconnect();
  }
}
