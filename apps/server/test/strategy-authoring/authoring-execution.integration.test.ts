import { authoringStrategySchema } from '@thesis-ledger/schemas';
import { readFileSync } from 'node:fs';
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { registerAuthoringAnalysisCases } from './authoring-execution-analysis.cases.js';
import { registerAuthoringSaveCases } from './authoring-execution-save.cases.js';
import { authoringExecutionContext } from './authoring-execution.fixture.js';

const enabled = process.env.AUTHORING_ISOLATED === '1';
describe.skipIf(!enabled)('隔离 PostgreSQL、Redis、HTTP Provider 与编写 API', () => {
  const suiteScope = authoringExecutionContext();
  registerAuthoringAdmissionCases(suiteScope);
  registerAuthoringLifecycleCases(suiteScope);
  registerAuthoringRecoveryCases(suiteScope);
});

function registerAuthoringAdmissionCases(suiteScope: ReturnType<typeof authoringExecutionContext>) {
  it('真实排队到终态，幂等只调用一次，双用户读取与取消隔离', async () => {
    const first = await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      201,
      suiteScope.selection('once'),
      suiteScope.alice.token,
    );
    const repeated = await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      201,
      suiteScope.selection('once'),
      suiteScope.alice.token,
    );
    expect(repeated.id).toBe(first.id);
    await suiteScope.request(
      `/strategy-authoring/operations/${first.id}`,
      404,
      undefined,
      suiteScope.bob.token,
    );
    await suiteScope.request(
      `/strategy-authoring/operations/${first.id}/cancel`,
      404,
      {},
      suiteScope.bob.token,
    );
    const finished = await suiteScope.observe(first.id as string);
    expect(finished.status).toBe('succeeded');
    expect(suiteScope.providerCalls).toBe(1);
    expect(suiteScope.modelBodies.map((body) => body.model)).toEqual(['selected-authoring-model']);
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
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      409,
      { ...suiteScope.selection('once'), model: 'forged-model' },
      suiteScope.alice.token,
    );
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      400,
      { ...suiteScope.selection('forged'), cost: { amount: '0' } },
      suiteScope.alice.token,
    );
    expect(suiteScope.providerCalls).toBe(1);
  });
  it('模型格式失败保留实际用量，不自动重发或改写草稿', async () => {
    suiteScope.output = { unexpected: '结构错误' };
    const next = await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      201,
      suiteScope.selection('invalid-output'),
      suiteScope.alice.token,
    );
    const failed = await suiteScope.observe(next.id as string);
    expect(failed.status).toBe('failed');
    expect(suiteScope.providerCalls).toBe(2);
    expect(failed.outcome).toMatchObject({
      externalResult: 'received',
      errorCode: 'AUTHORING_SCHEMA_INVALID',
      usage: { status: 'reported', inputTokens: 12, outputTokens: 24 },
    });
    expect(
      (
        await suiteScope.request(
          `/strategy-authoring/drafts/${suiteScope.draftId}`,
          200,
          undefined,
          suiteScope.alice.token,
        )
      ).revision,
    ).toBe(1);
    expect(
      (
        await suiteScope.request(
          `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
          201,
          suiteScope.selection('invalid-output'),
          suiteScope.alice.token,
        )
      ).id,
    ).toBe(next.id);
    expect(suiteScope.providerCalls).toBe(2);
    suiteScope.output = { requirements: [], questions: [], runtimeIntents: [] };
  });
  it('队列拒绝及模型未就绪不创建付费意图，查询失败不补投', async () => {
    await suiteScope.redis.quit();
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      503,
      suiteScope.selection('queue-rejected'),
      suiteScope.alice.token,
    );
    await suiteScope.redis.connect();
    await suiteScope.redis.ping();
    suiteScope.modelReady = false;
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      400,
      suiteScope.selection('model-rejected'),
      suiteScope.alice.token,
    );
    suiteScope.modelReady = true;
    expect(
      await suiteScope.operations.findIntent(
        suiteScope.alice.principal.id,
        suiteScope.draftId,
        'queue-rejected',
      ),
    ).toBeNull();
    expect(
      await suiteScope.operations.findIntent(
        suiteScope.alice.principal.id,
        suiteScope.draftId,
        'model-rejected',
      ),
    ).toBeNull();
    const direct = await suiteScope.operations.submit(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      {
        ...suiteScope.selection('not-delivered'),
        promptVersion: 'authoring-prompt-v1',
        capabilityVersion: 'authoring-v1',
        cost: {
          status: 'unknown',
          amount: null,
          currency: null,
          source: null,
          pricingVersion: null,
        },
        unknownCostAcknowledgedAt: new Date().toISOString(),
      },
    );
    await suiteScope.db
      .$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${direct.id}::uuid`;
    const query = vi
      .spyOn(suiteScope.queue, 'deliveryState')
      .mockRejectedValueOnce(new Error('查询失败'));
    await expect(suiteScope.worker.reconcile()).rejects.toThrow('查询失败');
    query.mockRestore();
    expect(
      (await suiteScope.operations.read(suiteScope.alice.principal.id, direct.id)).deliveryAttempts,
    ).toBe(0);
    expect(suiteScope.providerCalls).toBe(2);
    await suiteScope.request(
      `/strategy-authoring/operations/${direct.id}/cancel`,
      400,
      { ownerId: suiteScope.bob.principal.id },
      suiteScope.alice.token,
    );
    const cancelled = await suiteScope.request(
      `/strategy-authoring/operations/${direct.id}/cancel`,
      201,
      {},
      suiteScope.alice.token,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.outcome).toMatchObject({ attempt: 0, externalResult: 'not_sent' });
    const exhausted = await suiteScope.operations.submit(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      {
        ...direct.input.selection,
        idempotencyKey: 'bounded-redelivery',
      },
    );
    const enqueue = vi
      .spyOn(suiteScope.queue, 'enqueue')
      .mockRejectedValue(new Error('受控投递失败'));
    for (let attempt = 0; attempt < 2; attempt++) {
      await suiteScope.db
        .$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${exhausted.id}::uuid`;
      await expect(suiteScope.worker.reconcile()).rejects.toThrow('受控投递失败');
    }
    enqueue.mockRestore();
    await suiteScope.db
      .$executeRaw`UPDATE "StrategyAuthoringOperation" SET "updatedAt"=clock_timestamp()-interval '20 seconds' WHERE id=${exhausted.id}::uuid`;
    await suiteScope.worker.reconcile();
    const terminal = await suiteScope.operations.read(suiteScope.alice.principal.id, exhausted.id);
    expect(terminal.deliveryAttempts).toBe(2);
    expect(terminal.status).toBe('failed');
    expect(terminal.outcome).toMatchObject({
      attempt: 0,
      externalResult: 'not_sent',
      errorCode: 'AUTHORING_DELIVERY_EXHAUSTED',
    });
    expect(suiteScope.providerCalls).toBe(2);
  });
}
function registerAuthoringLifecycleCases(suiteScope: ReturnType<typeof authoringExecutionContext>) {
  it('未知费用必须明确确认并绑定所选模型，调用后仍保留未知而不变成零', async () => {
    suiteScope.pricesKnown = false;
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      400,
      suiteScope.selection('unknown-rejected'),
      suiteScope.alice.token,
    );
    expect(
      await suiteScope.operations.findIntent(
        suiteScope.alice.principal.id,
        suiteScope.draftId,
        'unknown-rejected',
      ),
    ).toBeNull();
    const acknowledged = {
      ...suiteScope.selection('unknown-acknowledged'),
      unknownCostAcknowledgedAt: new Date().toISOString(),
    };
    const submitted = await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      201,
      acknowledged,
      suiteScope.alice.token,
    );
    const finished = await suiteScope.observe(submitted.id as string);
    expect(finished.status).toBe('succeeded');
    expect(suiteScope.providerCalls).toBe(3);
    expect(finished.outcome).toMatchObject({
      cost: { status: 'unknown', amount: null, currency: null, source: null },
    });
    expect(finished.input).toMatchObject({
      selection: {
        model: 'selected-authoring-model',
        unknownCostAcknowledgedAt: acknowledged.unknownCostAcknowledgedAt,
      },
    });
    await suiteScope.request(
      `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
      409,
      { ...acknowledged, model: 'other-model' },
      suiteScope.alice.token,
    );
    suiteScope.pricesKnown = true;
  });
  it('两个执行器同时读到排队状态时，失败领取者不取消已领取者', async () => {
    const original = await suiteScope.operations.findIntent(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      'once',
    );
    const submitted = await suiteScope.operations.submit(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      {
        ...original!.input.selection,
        idempotencyKey: 'concurrent-executors',
      },
    );
    const read = suiteScope.operations.lookupForExecution.bind(suiteScope.operations);
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolveBarrier) => {
      release = resolveBarrier;
    });
    const lookup = vi
      .spyOn(suiteScope.operations, 'lookupForExecution')
      .mockImplementation(async (id) => {
        const value = await read(id);
        if (++arrivals === 2) release();
        await barrier;
        return value;
      });
    try {
      await Promise.all([
        suiteScope.execution.execute(submitted.id),
        suiteScope.execution.execute(submitted.id),
      ]);
    } finally {
      lookup.mockRestore();
    }
    const finished = await suiteScope.operations.read(suiteScope.alice.principal.id, submitted.id);
    expect(finished.status).toBe('succeeded');
    expect(finished.attempt).toBe(1);
    expect(finished.cancelRequestedAt).toBeNull();
    expect(suiteScope.providerCalls).toBe(4);
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
        ...suiteScope.blank,
        definitionText: kind === 'modify' ? JSON.stringify(definition) : '',
        requirements: [
          {
            id: 'rule',
            quote: suiteScope.blank.description,
            interpretation: '受控明确要求',
            state: 'understood',
            definitionPaths: [],
          },
        ],
        confirmation: {
          instrumentId: suiteScope.instrumentId,
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
      const independent = await suiteScope.request(
        '/strategy-authoring/drafts',
        201,
        content,
        suiteScope.alice.token,
      );
      suiteScope.output = {
        definition:
          kind === 'modify'
            ? { ...definition, risk: [{ type: 'fixedStop', percent: '0.03' }] }
            : definition,
        coverage: [{ requirementId: 'rule', definitionPaths: ['entry'] }],
      };
      const submitted = await suiteScope.request(
        `/strategy-authoring/drafts/${independent.id as string}/operations`,
        201,
        {
          ...suiteScope.selection(`queue-${kind}`),
          kind,
          ...(kind === 'modify'
            ? { intent: '止损改为 3%，其他不变', modificationTarget: 'risk' }
            : {}),
        },
        suiteScope.alice.token,
      );
      expect((await suiteScope.observe(submitted.id as string)).status).toBe('succeeded');
    }
    for (const mode of ['model-mismatch', 'large-output'] as const) {
      const before = suiteScope.providerCalls;
      suiteScope.actualModel =
        mode === 'model-mismatch' ? 'unexpected-model' : 'selected-authoring-model';
      suiteScope.output = {
        requirements: [],
        questions: [],
        runtimeIntents: mode === 'large-output' ? Array(40).fill('x'.repeat(2000)) : [],
      };
      const submitted = await suiteScope.request(
        `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
        201,
        suiteScope.selection(mode),
        suiteScope.alice.token,
      );
      const failed = await suiteScope.observe(submitted.id as string);
      expect(failed.status).toBe('failed');
      expect(suiteScope.providerCalls).toBe(before + 1);
      expect(failed.outcome).toMatchObject({
        externalResult: 'received',
        errorCode:
          mode === 'model-mismatch' ? 'AUTHORING_MODEL_MISMATCH' : 'AUTHORING_OUTPUT_TOO_LARGE',
      });
      const facts = (
        failed.invocations as Array<{ facts: Array<{ details: { actualModel: string } }> }>
      )[0]!.facts;
      expect(facts.at(-1)!.details.actualModel).toBe(suiteScope.actualModel);
    }
    suiteScope.actualModel = 'selected-authoring-model';
    suiteScope.output = { requirements: [], questions: [], runtimeIntents: [] };
  });
}
function registerAuthoringRecoveryCases(suiteScope: ReturnType<typeof authoringExecutionContext>) {
  it('在途取消和过期后的晚到响应保留收到事实，不覆盖终态或再收费', async () => {
    for (const mode of ['cancel', 'expire'] as const) {
      const before = suiteScope.providerCalls;
      let release!: () => void;
      suiteScope.heldResponse = new Promise<void>((resolveResponse) => {
        release = resolveResponse;
      });
      const submitted = await suiteScope.request(
        `/strategy-authoring/drafts/${suiteScope.draftId}/operations`,
        201,
        suiteScope.selection(`held-${mode}`),
        suiteScope.alice.token,
      );
      try {
        for (let step = 0; suiteScope.providerCalls === before && step < 100; step++)
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        expect(suiteScope.providerCalls).toBe(before + 1);
        if (mode === 'cancel')
          await suiteScope.request(
            `/strategy-authoring/operations/${submitted.id}/cancel`,
            201,
            {},
            suiteScope.alice.token,
          );
        else {
          await suiteScope.db
            .$executeRaw`UPDATE "StrategyAuthoringOperation" SET "leaseUntil"=clock_timestamp()-interval '1 second' WHERE id=${submitted.id as string}::uuid`;
          await suiteScope.worker.reconcile();
        }
      } finally {
        release();
        suiteScope.heldResponse = undefined;
      }
      let finished = await suiteScope.observe(submitted.id as string);
      for (let step = 0; step < 100; step++) {
        const invocation = (finished.invocations as Array<{ facts: Array<{ kind: string }> }>)[0];
        if (invocation?.facts.at(-1)?.kind === 'received') break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        finished = await suiteScope.request(
          `/strategy-authoring/operations/${submitted.id}`,
          200,
          undefined,
          suiteScope.alice.token,
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
      expect(suiteScope.providerCalls).toBe(before + 1);
    }
    expect(
      (
        await suiteScope.request(
          `/strategy-authoring/drafts/${suiteScope.draftId}`,
          200,
          undefined,
          suiteScope.alice.token,
        )
      ).revision,
    ).toBe(1);
  });
  registerAuthoringAnalysisCases(suiteScope.caseContext);
  it('排队后计价配置变化时拒绝派发，审计明确未发送而不估算已收费', async () => {
    const before = suiteScope.providerCalls;
    const original = await suiteScope.operations.findIntent(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      'once',
    );
    const submitted = await suiteScope.operations.submit(
      suiteScope.alice.principal.id,
      suiteScope.draftId,
      {
        ...original!.input.selection,
        expectedRevision: 3,
        idempotencyKey: 'pricing-changed',
      },
    );
    suiteScope.pricesKnown = false;
    try {
      await suiteScope.execution.execute(submitted.id);
    } finally {
      suiteScope.pricesKnown = true;
    }
    const failed = await suiteScope.request(
      `/strategy-authoring/operations/${submitted.id}`,
      200,
      undefined,
      suiteScope.alice.token,
    );
    expect(failed.status).toBe('failed');
    expect(suiteScope.providerCalls).toBe(before);
    expect(failed.outcome).toMatchObject({
      externalResult: 'not_sent',
      errorCode: 'AUTHORING_MODEL_CONFIGURATION_CHANGED',
      usage: null,
      cost: { status: 'unknown', amount: null, currency: null },
    });
    const facts = (failed.invocations as Array<{ facts: Array<{ kind: string }> }>)[0]!.facts;
    expect(facts.map((fact) => fact.kind)).toEqual(['not_sent']);
  });
  registerAuthoringSaveCases(suiteScope.caseContext);
}
