import { setTimeout as delay } from 'node:timers/promises';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { researchFailureOutcome } from '../../src/ai/timeout/ai-research-arrival.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchSdkHttpFixture, policy, summary } from './research-sdk-http.fixture.js';
import {
  AiSdkGenerationError,
  type AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
  type AiSdkGenerationResult,
} from '../../src/ai/ai-sdk-generation.adapter.js';

const output = {
  conclusion: '本地研究结果',
  evidence: [],
  risks: [],
  unknowns: [],
  disclaimer: 'test',
  signals: [],
};
const completed = (): AiSdkGenerationResult<typeof output> => ({
  output,
  usage: { status: 'reported', inputTokens: 9, outputTokens: 6 },
  finishReason: 'stop',
  rawFinishReason: 'stop',
  actualModel: 'fixture-model',
  providerCost: '0',
  providerCostCurrency: 'USD',
  timeToFirstEventMs: 1,
  timeToFirstTextMs: 1,
});

describe('正式研究接线的期限与晚到结果', () => {
  it.each(['cancelled', 'task_budget_exhausted'] as const)(
    '完整响应因%s拒绝发布时保留Provider完成事实',
    (code) => {
      const error = new AiSdkGenerationError({
        code,
        phase: 'request',
        summary: 'stop',
        externalResult: 'complete',
        requestId: null,
      });
      expect(
        researchFailureOutcome(
          error.fact,
          completed(),
          aiGenerationContracts.research.ref,
          'fixture-model',
        ),
      ).toMatchObject({
        status: 'complete',
        schemaAccepted: true,
        actualModel: 'fixture-model',
        finishReason: 'stop',
      });
    },
  );
  const fixture = new ResearchSdkHttpFixture();
  beforeAll(() => fixture.start());
  beforeEach(() => fixture.reset());
  afterAll(() => fixture.stop());

  it('收尾预留已占满余量时不派发Provider请求', async () => {
    const execution = summary(policy, new Date(Date.now() + 5).toISOString());
    const state = await fixture.execute(execution);
    expect(fixture.requestCount).toBe(0);
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ continuationBlockedReason: 'expired' }),
    );
  });

  it('不合作的适配器晚到成功不能发布，但已知完成与usage仍保存', async () => {
    const generate = vi.fn(async () => {
      await delay(110);
      return completed();
    });
    const state = await fixture.execute(
      summary(policy, new Date(Date.now() + 80).toISOString()),
      new AbortController().signal,
      { adapter: { generate } as unknown as AiSdkGenerationAdapter },
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: 'research_task_budget_exhausted',
        continuationBlockedReason: 'expired',
      }),
    );
    const request = state.execution().requests.at(-1);
    expect(request?.error).toMatchObject({
      code: 'task_budget_exhausted',
      externalResult: 'complete',
    });
    expect(request?.outcome).toMatchObject({
      status: 'complete',
      schemaAccepted: true,
      actualModel: 'fixture-model',
    });
    expect(request?.usageRevisions.at(-1)?.usage).toMatchObject({
      status: 'reported',
      inputTokens: 9,
      outputTokens: 6,
    });
    expect(state.execution().generationStatus).toBe('complete');
  });

  it('同路由受控重试使用不同子signal并保留原deadline／总调用预算', async () => {
    const signals: AbortSignal[] = [],
      deadlines: number[] = [];
    const generate = vi.fn(async (input: AiSdkGenerationRequest<unknown>) => {
      signals.push(input.signal);
      deadlines.push(input.timeoutDecision!.taskDeadlineAt);
      if (signals.length === 1)
        throw new AiSdkGenerationError({
          code: 'provider_rejected',
          phase: 'response_headers',
          externalResult: 'rejected_before_generation',
          summary: '本地限流夹具',
          retryAfterMs: 0,
          requestId: input.requestId,
        });
      return completed();
    });
    const execution = summary(),
      state = await fixture.execute(execution, new AbortController().signal, {
        adapter: { generate } as unknown as AiSdkGenerationAdapter,
      });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(deadlines).toEqual([
      Date.parse(execution.deadlineAt!),
      Date.parse(execution.deadlineAt!),
    ]);
    expect(state.execution().requests).toHaveLength(2);
    expect(state.execution().generationStatus).toBe('complete');
  });

  it('授权事务跨过截止时不调用适配器，未发送保留为明确not_sent', async () => {
    const generate = vi.fn(async () => completed());
    const state = await fixture.execute(
      summary(policy, new Date(Date.now() + 80).toISOString()),
      new AbortController().signal,
      { adapter: { generate } as unknown as AiSdkGenerationAdapter, authorizeDelayMs: 110 },
    );
    expect(generate).not.toHaveBeenCalled();
    expect(state.store.prepareRequest).toHaveBeenCalledOnce();
    expect(state.failOwned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        continuationBlockedReason: 'expired',
        requestError: expect.objectContaining({
          code: 'task_budget_exhausted',
          externalResult: 'not_sent',
        }),
      }),
    );
  });
});
