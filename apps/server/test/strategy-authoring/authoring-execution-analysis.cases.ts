import { expect, it } from 'vitest';
import type { AuthoringExecutionCaseContext } from './authoring-execution.case-context.js';

export function registerAuthoringAnalysisCases(getContext: () => AuthoringExecutionCaseContext) {
  it('真实 SDK 返回误标的并行交易需求时，应用与人工确认均保持服务端不支持门禁', async () => {
    const context = getContext();
    const { request, observe, selection, alice, blank } = context;
    const quote = '同时交易159516.SZ和510300.SH。';
    const independent = await request(
      '/strategy-authoring/drafts',
      201,
      { ...blank, description: quote },
      alice.token,
    );
    const id = independent.id as string;
    const previous = context.output;
    context.output = {
      requirements: [
        {
          id: 'parallel',
          quote,
          interpretation: '模型误标已理解',
          state: 'understood',
          definitionPaths: [],
        },
      ],
      questions: [],
      runtimeIntents: [],
    };
    try {
      const operation = await request(
        `/strategy-authoring/drafts/${id}/operations`,
        201,
        selection('parallel-capability'),
        alice.token,
      );
      expect((await observe(operation.id as string)).status).toBe('succeeded');
      await request(
        `/strategy-authoring/operations/${operation.id}/apply-analysis`,
        201,
        { expectedRevision: 1 },
        alice.token,
      );
      const applied = await request(
        `/strategy-authoring/drafts/${id}`,
        200,
        undefined,
        alice.token,
      );
      const content = applied.content as Record<string, unknown>;
      expect(content.requirements).toMatchObject([{ quote, state: 'unsupported' }]);
      await request(
        `/strategy-authoring/drafts/${id}`,
        200,
        {
          expectedRevision: 2,
          content: {
            ...content,
            requirements: [
              {
                id: 'parallel',
                quote,
                interpretation: '人工误确认',
                state: 'understood',
                definitionPaths: [],
              },
            ],
          },
        },
        alice.token,
        'PATCH',
      );
      const latest = await request(`/strategy-authoring/drafts/${id}`, 200, undefined, alice.token);
      expect((latest.content as Record<string, unknown>).requirements).toMatchObject([
        { quote, state: 'unsupported' },
      ]);
      const rejected = await request(
        `/strategy-authoring/drafts/${id}/operations`,
        400,
        { ...selection('parallel-generation'), expectedRevision: 3, kind: 'generate' },
        alice.token,
      );
      expect(JSON.stringify(rejected)).toContain('首期仅支持单标的');
    } finally {
      context.output = previous;
    }
  });
  it('分析伪造原文明确失败，实际收到的用量仍保留且不重发', async () => {
    const context = getContext();
    const { request, observe, selection, alice, draftId } = context;
    const before = context.providerCalls;
    context.output = {
      requirements: [
        {
          id: 'fabricated',
          quote: '用户从未说过的止损规则',
          interpretation: '伪造要求',
          state: 'understood',
          definitionPaths: [],
        },
      ],
      questions: [],
      runtimeIntents: [],
    };
    const submitted = await request(
      `/strategy-authoring/drafts/${draftId}/operations`,
      201,
      selection('fabricated-analysis'),
      alice.token,
    );
    const failed = await observe(submitted.id as string);
    expect(failed.status).toBe('failed');
    expect(context.providerCalls).toBe(before + 1);
    expect(failed.outcome).toMatchObject({
      externalResult: 'received',
      errorCode: 'AUTHORING_ANALYSIS_INVALID',
      usage: { status: 'reported', inputTokens: 12, outputTokens: 24 },
    });
    await request(
      `/strategy-authoring/operations/${submitted.id}/apply-analysis`,
      409,
      { expectedRevision: 1 },
      alice.token,
    );
    context.output = { requirements: [], questions: [], runtimeIntents: [] };
  });
  it('双用户隔离、并发应用只追加一个修订，响应重试不覆盖之后的编辑', async () => {
    const context = getContext();
    const { request, alice, bob, draftId, operations, db, blank } = context;
    const original = await operations.findIntent(alice.principal.id, draftId, 'once');
    const path = `/strategy-authoring/operations/${original!.id}/apply-analysis`;
    await request(path, 404, { expectedRevision: 1 }, bob.token);
    await request(path, 400, { expectedRevision: 1, outputText: '{}' }, alice.token);
    const [first, duplicate] = await Promise.all([
      request(path, 201, { expectedRevision: 1 }, alice.token),
      request(path, 201, { expectedRevision: 1 }, alice.token),
    ]);
    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({ draftId, appliedRevision: 2 });
    const applied = await request(
      `/strategy-authoring/drafts/${draftId}`,
      200,
      undefined,
      alice.token,
    );
    expect(applied.revision).toBe(2);
    expect(applied.content).toEqual(blank);
    const edited = { ...blank, description: '应用分析后用户自己修改的输入' };
    await request(
      `/strategy-authoring/drafts/${draftId}`,
      200,
      { expectedRevision: 2, content: edited },
      alice.token,
      'PATCH',
    );
    expect(await request(path, 201, { expectedRevision: 1 }, alice.token)).toEqual(first);
    const later = await request(
      `/strategy-authoring/drafts/${draftId}`,
      200,
      undefined,
      alice.token,
    );
    expect(later.revision).toBe(3);
    expect(later.content).toEqual({ ...edited, confirmation: null });
    const stale = await operations.findIntent(alice.principal.id, draftId, 'concurrent-executors');
    await request(
      `/strategy-authoring/operations/${stale!.id}/apply-analysis`,
      409,
      { expectedRevision: 1 },
      alice.token,
    );
    const revisions = await db.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM "StrategyAuthoringRevision" WHERE "draftId"=${draftId}::uuid`;
    expect(Number(revisions[0]!.count)).toBe(3);
  });
  it('缺项描述补全后重新分析只审核当前条目，HTTP 与真实 SDK 请求不残留旧问题', async () => {
    const context = getContext();
    const { request, observe, selection, alice, blank, modelBodies } = context;
    const independent = await request(
      '/strategy-authoring/drafts',
      201,
      { ...blank, description: '旧问题' },
      alice.token,
    );
    const id = independent.id as string;
    context.output = {
      requirements: [
        {
          id: 'same',
          quote: '旧问题',
          interpretation: '待澄清',
          state: 'unresolved',
          definitionPaths: [],
        },
      ],
      questions: [
        {
          id: 'old',
          basedOnRevision: 1,
          quote: '旧问题',
          reason: '确认仓位',
          options: [],
          dependsOn: [],
          answer: null,
          answerState: 'unanswered',
        },
      ],
      runtimeIntents: [],
    };
    const first = await request(
      `/strategy-authoring/drafts/${id}/operations`,
      201,
      selection('browser-reanalysis-first'),
      alice.token,
    );
    expect((await observe(first.id as string)).status).toBe('succeeded');
    await request(
      `/strategy-authoring/operations/${first.id as string}/apply-analysis`,
      201,
      { expectedRevision: 1 },
      alice.token,
    );
    const analyzed = await request(`/strategy-authoring/drafts/${id}`, 200, undefined, alice.token);
    const content = {
      ...(analyzed.content as Record<string, unknown>),
      description: '完整现行描述',
    };
    await request(
      `/strategy-authoring/drafts/${id}`,
      200,
      { expectedRevision: 2, content },
      alice.token,
      'PATCH',
    );
    context.output = {
      requirements: [
        {
          id: 'same',
          quote: '完整现行描述',
          interpretation: '现行规则',
          state: 'understood',
          definitionPaths: [],
        },
      ],
      questions: [],
      runtimeIntents: [],
    };
    const second = await request(
      `/strategy-authoring/drafts/${id}/operations`,
      201,
      { ...selection('browser-reanalysis-current'), expectedRevision: 3 },
      alice.token,
    );
    expect((await observe(second.id as string)).status).toBe('succeeded');
    await request(
      `/strategy-authoring/operations/${second.id as string}/apply-analysis`,
      201,
      { expectedRevision: 3 },
      alice.token,
    );
    const current = await request(`/strategy-authoring/drafts/${id}`, 200, undefined, alice.token);
    expect(current.content).toMatchObject({
      description: '完整现行描述',
      questions: [],
      requirements: [{ id: 'same', quote: '完整现行描述' }],
    });
    const body = modelBodies.at(-1) as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(
      JSON.parse(body.messages.find((message) => message.role === 'user')!.content).content,
    ).toMatchObject({ questions: [], requirements: [] });
    expect(
      (
        await request(
          `/strategy-authoring/operations/${first.id as string}`,
          200,
          undefined,
          alice.token,
        )
      ).status,
    ).toBe('succeeded');
  });
}
