// 在目标 Server 中运行正式服务，只将 SDK 的 HTTP 传输替换为归档响应。
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { hashCanonicalManifest } from './apps/server/dist/src/backtest/backtest-snapshot.js';
import { StrategyCreationService } from './apps/server/dist/src/backtest/strategy-creation.service.js';
import { InstrumentService } from './apps/server/dist/src/market/instrument.service.js';
import { AiInvocationStore } from './apps/server/dist/src/ai/ai-invocation.store.js';
import { AiSdkGenerationAdapter } from './apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { generationOutput } from './apps/server/dist/src/ai/ai-generation-output.js';
import { AuthoringDraftRepository } from './apps/server/dist/src/strategy-authoring/authoring-draft.repository.js';
import { AuthoringOperationRepository } from './apps/server/dist/src/strategy-authoring/authoring-operation.repository.js';
import { AuthoringProvenanceRepository } from './apps/server/dist/src/strategy-authoring/authoring-provenance.repository.js';
import { AuthoringResultRepository } from './apps/server/dist/src/strategy-authoring/authoring-result.repository.js';
import { AuthoringSaveService } from './apps/server/dist/src/strategy-authoring/authoring-save.service.js';
import { AuthoringProposalService } from './apps/server/dist/src/strategy-authoring/authoring-proposal.service.js';
import { AuthoringSubmitService } from './apps/server/dist/src/strategy-authoring/authoring-submit.service.js';
import { AuthoringExecutor } from './apps/server/dist/src/strategy-authoring/authoring.executor.js';
import { authoringOperationSchema } from './apps/server/dist/src/strategy-authoring/authoring-operation-schema.js';
import { authoringContract } from './apps/server/dist/src/strategy-authoring/authoring-model-policy.js';

function replayTransport(model) {
  let next;
  const sdk = new AiSdkGenerationAdapter();
  return {
    arm(text, check) {
      assert.equal(next, undefined);
      next = { text, check };
    },
    generate(request) {
      return sdk.generate({
        ...request,
        httpClient: async (url, init) => {
          assert.equal(String(url), 'http://127.0.0.1:1/v1/chat/completions');
          assert(next, '缺少受控回执或同一次操作重复请求');
          const { text, check } = next;
          next = undefined;
          const body = JSON.parse(init.body);
          assert.equal(body.model, model);
          assert.equal(body.stream, true);
          check(body);
          const frames = [
            { delta: { role: 'assistant', content: text }, finish_reason: null },
            { delta: {}, finish_reason: 'stop' },
          ].map(
            (choice) =>
              'data: ' +
              JSON.stringify({
                id: 'frozen-response',
                created: 1,
                model,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, ...choice }],
              }) +
              '\n\n',
          );
          return new Response(frames.join('') + 'data: [DONE]\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          });
        },
      });
    },
  };
}

function fullFormat(body) {
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(Object.keys(body.response_format.json_schema.schema.properties).sort(), [
    'intentCheck',
    'proposal',
  ]);
}

export async function checkOrderValidityTarget({ samples, dbUrl }) {
  const url = new URL(dbUrl);
  assert.match(url.hostname, /^validity-fixture-[0-9a-f]{12}$/);
  assert.equal(url.pathname, '/order_validity_fixture');
  const db = new PrismaClient({ datasourceUrl: dbUrl });
  try {
    assert.deepEqual(
      await db.$queryRaw`SELECT current_database()::text AS db, current_user::text AS owner`,
      [{ db: 'order_validity_fixture', owner: 'fixture_owner' }],
    );
    const drafts = new AuthoringDraftRepository(db),
      operations = new AuthoringOperationRepository(db);
    const sources = new AuthoringProvenanceRepository(db),
      instruments = new InstrumentService(db);
    const save = new AuthoringSaveService(db, new StrategyCreationService(), sources, instruments);
    const proposals = new AuthoringProposalService(db, operations, sources, drafts);
    const generate = new AuthoringResultRepository(db, drafts);
    const model = samples[0].wire.model;
    const transport = replayTransport(model);
    const providers = { refreshRegistry: async () => {} };
    const provider = {
      id: 'offline',
      models: [model],
      metadata: {
        modelPricing: {
          [model]: {
            costPer1kInput: 0,
            costPer1kOutput: 0,
            costCurrency: 'USD',
          },
        },
      },
      sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1/v1', apiKey: '', authMode: 'none' }),
    };
    const registry = {
      strictReadyContract: ({ contract }) => ({
        provider,
        execution: {
          contract,
          adapter: 'openai-compatible-chat',
          mode: 'native_schema',
          liveValidation: { status: 'passed' },
          readiness: { configurationFingerprint: 'a'.repeat(64) },
        },
      }),
    };
    const executor = new AuthoringExecutor(
      operations,
      providers,
      registry,
      new AiInvocationStore(db),
      transport,
    );
    const submit = new AuthoringSubmitService(
      drafts,
      operations,
      { ready: async () => {}, enqueue: (id) => executor.execute(id) },
      providers,
      registry,
      instruments,
    );
    const user = await db.identityUser.create({
      data: { username: 'offline', displayName: '隔离验收', passwordHash: 'disabled' },
    });
    const catalog = await db.instrument.create({
      data: {
        canonicalCode: '159516',
        instrumentType: 'ETF',
        market: 'SZ',
        displayName: '隔离验收',
        generation: 1,
      },
    });
    const receipts = [];
    const ref = authoringContract('modify').ref;
    assert.equal(ref.version, 'authoring-modification-v5');
    for (const sample of samples) {
      const { content, selection } = sample.op.input;
      const before = JSON.parse(content.definitionText);
      const draft = await drafts.create(user.id, {
        ...content,
        definitionText: '',
        confirmation: { ...content.confirmation, instrumentId: catalog.id },
      });
      async function run(kind, target, rev, text, check) {
        transport.arm(text, check);
        const op = await submit.submit(user.id, draft.id, {
          kind,
          expectedRevision: rev,
          idempotencyKey: kind + '-' + (target ?? 'baseline'),
          providerId: provider.id,
          model,
          intent: selection.intent,
          unknownCostAcknowledgedAt: null,
          ...(target ? { modificationTarget: target } : {}),
        });
        const done = await operations.read(user.id, op.id);
        assert.equal(done.status, 'succeeded', String(done.outcome?.errorCode));
        return done;
      }
      const generated = await run(
        'generate',
        null,
        1,
        JSON.stringify({
          intentCheck: '隔离基线',
          proposal: {
            definition: before,
            coverage: [{ requirementId: 'rules', definitionPaths: ['execution'] }],
          },
        }),
        fullFormat,
      );
      await generate.applyGeneration(user.id, generated.id, { expectedRevision: 1 });
      const rev = { expectedRevision: 2 };
      const baseline = await save.review(user.id, draft.id);
      assert.deepEqual(baseline.definition, before);
      const standard = await run('modify', 'execution', 2, JSON.stringify(sample.full), fullFormat);
      const prior = await proposals.prepare(user.id, standard.id, rev);
      assert.deepEqual(JSON.parse(prior.payload.afterText), sample.definition);
      await sources.discardProposal(user.id, prior.id, 2);
      const ordinary = [];
      for (const target of ['entry', 'exit', 'sizing', 'risk', 'cost', 'tradePlan', 'execution']) {
        const op = structuredClone(standard);
        op.input.selection.modificationTarget = target;
        const schema = authoringOperationSchema(op);
        const format = await generationOutput('native_schema', schema, ref).responseFormat;
        assert.deepEqual(Object.keys(format.schema.properties).sort(), ['intentCheck', 'proposal']);
        assert.equal(schema.safeParse(JSON.parse(sample.short)).success, false);
        ordinary.push(target);
      }
      const short = await run('modify', 'entryOrderValidity', 2, sample.short, (body) => {
        assert.deepEqual(body.response_format, sample.wire.response_format);
        assert.equal(body.max_tokens, sample.wire.max_tokens);
        assert.deepEqual(body.messages[0], sample.wire.messages[0]);
        assert.equal(body.messages.length, 2);
        assert.deepEqual(JSON.parse(body.messages[1].content), {
          ...JSON.parse(sample.wire.messages[1].content),
          revision: 2,
        });
      });
      assert.equal(short.input.selection.promptVersion, 'authoring-order-validity-v1');
      const proposal = await proposals.prepare(user.id, short.id, rev);
      assert.deepEqual(proposal.payload.allowedPaths, ['execution.orders.0.validity']);
      assert.deepEqual(proposal.payload.differences, sample.differences);
      assert.deepEqual(JSON.parse(proposal.payload.afterText), sample.definition);
      assert.deepEqual(await save.review(user.id, draft.id), baseline);
      const conflict = (err) => err.getStatus?.() === 409;
      await assert.rejects(
        save.save(user.id, draft.id, {
          ...rev,
          name: sample.id,
          reviewedDefinitionHash: baseline.definitionHash,
        }),
        conflict,
      );
      await assert.rejects(
        proposals.apply(user.id, proposal.id, { expectedRevision: 1 }),
        conflict,
      );
      const applied = await proposals.apply(user.id, proposal.id, rev);
      assert.deepEqual(await proposals.apply(user.id, proposal.id, rev), applied);
      const review = await save.review(user.id, draft.id);
      assert.equal(review.revision, 3);
      const input = {
        expectedRevision: 3,
        name: sample.id,
        reviewedDefinitionHash: review.definitionHash,
      };
      const saved = await save.save(user.id, draft.id, input);
      assert.deepEqual(await save.save(user.id, draft.id, input), saved);
      const version = await db.strategyVersion.findUniqueOrThrow({
        where: { id: saved.versionId },
      });
      assert.deepEqual(version.schema, sample.definition);
      assert.deepEqual(version.source, { kind: 'ai_assisted', referenceId: draft.id });
      const source = await sources.readSource(user.id, saved.versionId);
      assert.deepEqual(source.snapshot.operationIds, [generated.id, standard.id, short.id]);
      assert.equal(hashCanonicalManifest(version.schema), sample.strategyHash);
      receipts.push({
        id: sample.id,
        versionId: saved.versionId,
        revision: review.revision,
        proposalId: proposal.id,
        differences: proposal.payload.differences,
        configuration: version.schema,
        strategyHash: sample.strategyHash,
        sourceOperationIds: source.snapshot.operationIds,
        shortProfile: short.input.selection.promptVersion,
        ordinary,
        v5Contract: ref.version,
        ordinaryPrompt: standard.input.selection.promptVersion,
      });
    }
    return receipts;
  } finally {
    await db.$disconnect();
  }
}
