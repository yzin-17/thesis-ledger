import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchSdkHttpFixture, policy, summary } from './research-sdk-http.fixture.js';

describe('Research SDK local HTTP vertical', () => {
  const fixture = new ResearchSdkHttpFixture();
  const execute = fixture.execute;
  beforeAll(() => fixture.start());
  beforeEach(() => fixture.reset());
  afterAll(() => fixture.stop());

  it('明确生成前拒绝仅向同Provider／模型重试，分别预留和留痕', async () => {
    fixture.mode = 'retryOnce';
    const state = await execute(summary());
    expect(fixture.requestCount).toBe(2);
    expect(state.execution().requests).toHaveLength(2);
    expect(state.execution().requests.map((request) => request.reservation.provider)).toEqual([
      'primary',
      'primary',
    ]);
    expect(state.execution().requests[0]).toMatchObject({
      state: 'completed',
      error: { code: 'provider_rejected', externalResult: 'rejected_before_generation' },
    });
    expect(state.execution().generationStatus).toBe('complete');
    expect(state.execution().requests.at(-1)?.outcome?.actualModel).toBe('fixture-model');
  });

  it('完成事实记录 SDK 实际返回模型，保留预留中的请求模型', async () => {
    fixture.returnedModel = 'resolved/model';
    const state = await execute(summary());
    expect(fixture.requestCount).toBe(1);
    expect(state.execution().requests.at(-1)).toMatchObject({
      reservation: { model: 'fixture-model' },
      outcome: { status: 'complete', actualModel: 'resolved/model' },
    });
  });

  it('传输结果未知时不 fallback，并保留 unknown 请求事实', async () => {
    fixture.mode = 'disconnect';
    const state = await execute(summary());
    expect(fixture.requestCount).toBe(1);
    expect(state.markUnknown).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ errorCode: 'research_unknown_outcome' }),
    );
  });

  it('Retry-After 超过剩余期限时收敛失败，不重试或切换Provider', async () => {
    fixture.mode = 'retryAfterDeadline';
    const state = await execute(summary(policy, new Date(Date.now() + 1_000).toISOString()));
    expect(fixture.requestCount).toBe(1);
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ errorCode: 'research_provider_rejected' }),
    );
  });

  it('只授权一次时，明确拒绝也不增加发送次数', async () => {
    fixture.mode = 'retryOnce';
    const state = await execute(summary({ ...policy, maxAiCalls: 1 }));
    expect(fixture.requestCount).toBe(1);
    expect(state.execution().requests).toHaveLength(1);
    expect(state.failOwned).toHaveBeenCalledOnce();
  });

  it('预算预留不足时零次派发且明确收敛失败', async () => {
    const state = await execute(summary({ ...policy, maxInputTokens: 1 }));
    expect(fixture.requestCount).toBe(0);
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: 'research_budget_exhausted',
        continuationBlockedReason: 'budget_exceeded',
      }),
    );
  });

  it('Worker恢复时已有dispatching／unknown请求，不再发新的请求', async () => {
    for (const state of ['dispatching', 'unknown'] as const) {
      const execution = summary();
      execution.requests = [
        {
          requestId: '00000000-0000-4000-8000-000000000099',
          sequence: 1,
          state,
          reservation: {
            aiCalls: 1,
            inputTokens: 1,
            outputTokens: 1,
            cost: {
              status: 'estimated',
              amount: '0',
              currency: 'USD',
              source: 'fixture',
              pricingVersion: 'v1',
            },
          },
          dispatchExecutionAttempt: 1,
          preparedAt: new Date().toISOString(),
          dispatchingAt: new Date().toISOString(),
          completedAt: null,
          outcome: null,
          error: null,
          usageRevisions: [],
          settledRevision: 0,
        },
      ];
      const result = await execute(execution);
      expect(result.failOwned).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ errorCode: 'research_unknown_outcome' }),
      );
    }
    expect(fixture.requestCount).toBe(0);
  });

  it('迟到的首正文超过系统默认仍可在原任务期限内完成', async () => {
    fixture.mode = 'lateFirst';
    const state = await execute(
      summary(policy, new Date(Date.now() + 1500).toISOString()),
      new AbortController().signal,
      {
        timeouts: {
          firstOutputTimeoutMs: 30,
          outputIdleTimeoutMs: 30,
          firstOutputTimeoutSource: 'system',
          outputIdleTimeoutSource: 'system',
        },
      },
    );
    expect(fixture.requestCount).toBe(1);
    expect(state.execution().generationStatus).toBe('complete');
    expect(state.markUnknown).not.toHaveBeenCalled();
  });

  it('显式用途首输出限额仍执行，超时记未知且不重试', async () => {
    fixture.mode = 'lateFirst';
    const state = await execute(summary(), new AbortController().signal, {
      timeouts: { firstOutputTimeoutMs: 30, firstOutputTimeoutSource: 'route' },
    });
    expect(fixture.requestCount).toBe(1);
    expect(state.markUnknown).toHaveBeenCalledOnce();
  });

  it('创建起绝对期限已过时零 Provider 请求', async () => {
    const state = await execute(summary(policy, new Date(Date.now() - 1_000).toISOString()));
    expect(fixture.requestCount).toBe(0);
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: 'research_deadline_expired',
        continuationBlockedReason: 'expired',
      }),
    );
  });

  it('用户取消在途流时不 fallback，并释放为 cancelled/unknown 终态', async () => {
    fixture.mode = 'hang';
    const controller = new AbortController();
    const pending = execute(summary(), controller.signal);
    await vi.waitFor(() => expect(fixture.requestCount).toBe(1));
    controller.abort('user_cancelled');
    const state = await pending;
    expect(fixture.requestCount).toBe(1);
    expect(state.markUnknown).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ continuationBlockedReason: 'cancelled' }),
    );
  });

  it('一直在出字的长流不会被 Provider 级「超时（毫秒）」掐断', async () => {
    fixture.mode = 'slowStream';
    const state = await execute(summary(), new AbortController().signal, {
      // 现场复现：本地推理模型 research 探针实测 43～103 秒，而 Provider「超时（毫秒）」是 30 秒。
      // 这里把两个量按比例缩小——Provider 超时 900 ms，慢流总时长约 1.6 s，块间隔 400 ms。
      timeouts: {
        providerTimeoutMs: 900,
        firstOutputTimeoutMs: 900,
        outputIdleTimeoutMs: 900,
      },
    });
    expect(fixture.requestCount).toBe(1);
    expect(state.markUnknown).not.toHaveBeenCalled();
    expect(state.execution().requests[0]).toMatchObject({ state: 'completed' });
    expect(state.execution().generationStatus).toBe('complete');
  });

  it('执行时 Provider 价格变化仍使用创建时冻结的模型价格', async () => {
    const frozenPolicy = {
      ...policy,
      maxCost: '10',
      costCurrency: 'USD',
      paidRoutes: [{ provider: 'primary', models: ['fixture-model'] }],
    };
    const state = await execute(summary(frozenPolicy), new AbortController().signal, {
      currentPricing: { costPer1kInput: 9, costPer1kOutput: 9, costCurrency: 'USD' },
      frozenPricing: {
        costPer1kInput: 0.1,
        costPer1kOutput: 0.2,
        costCurrency: 'USD',
        pricingVersion: 'pricing-frozen-v1',
      },
    });

    expect(state.execution().requests[0]?.reservation.cost).toEqual({
      status: 'estimated',
      amount: '2.0013',
      currency: 'USD',
      source: 'frozen_provider_pricing',
      pricingVersion: 'pricing-frozen-v1',
    });
    expect(state.execution().requests[0]?.usageRevisions[0]?.cost).toMatchObject({
      amount: '0.0021',
      pricingVersion: 'pricing-frozen-v1',
    });
  });
});
