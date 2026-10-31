import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aiExecutionSummarySchema,
  aiGenerationContracts,
  type AiCostFacts,
} from '@thesis-ledger/schemas';
import { optimizationCostSummary } from '../../src/strategy-optimization/strategy-optimization-cost.js';

const time = '2026-10-31T00:00:00.000Z';
const fact = (status: AiCostFacts['status'], amount = '0', currency = 'USD'): AiCostFacts => ({
  status,
  amount: status === 'unknown' ? null : amount,
  currency,
  source: status === 'known' ? 'provider_reported' : 'frozen_provider_rates',
  pricingVersion: 'fixture-pricing',
});
const execution = (costs: (AiCostFacts | null)[]) =>
  aiExecutionSummarySchema.parse({
    version: 'sdk-execution-v1',
    contract: aiGenerationContracts.parameterOptimization.ref,
    frozenPolicy: null,
    deadlineAt: time,
    generationStatus: costs.includes(null) ? 'unknown' : 'complete',
    usageCompleteness: costs.includes(null) ? 'unknown' : 'reported',
    continuationBlockedReason: null,
    requests: costs.map((cost, index) => {
      const requestId = randomUUID();
      return {
        requestId,
        sequence: index + 1,
        state: cost ? 'completed' : 'unknown',
        reservation: { aiCalls: 1, inputTokens: 100, outputTokens: 50, cost: fact('estimated') },
        dispatchExecutionAttempt: 1,
        preparedAt: time,
        dispatchingAt: time,
        completedAt: time,
        outcome: cost
          ? {
              status: 'complete',
              finishReason: 'stop',
              contract: aiGenerationContracts.parameterOptimization.ref,
              schemaAccepted: true,
            }
          : null,
        error: null,
        usageRevisions: cost
          ? [
              {
                revision: 1,
                recordedAt: time,
                usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
                cost,
              },
            ]
          : [],
        settledRevision: cost ? 1 : 0,
      };
    }),
  });
const summary = (sdkExecution: unknown, legacy: object = {}) =>
  optimizationCostSummary(
    {
      modelConfig: [
        { provider: 'fixture', model: 'model', costStatus: 'known', costCurrency: 'USD' },
      ],
      costUsed: '999',
    },
    [
      {
        modelKey: 'fixture:model',
        cost: '999',
        modelMetadata: { ...legacy, sdkExecution },
      } as never,
    ],
  );

describe('策略实验的 SDK 费用事实读取', () => {
  it('已报告零费用覆盖旧合计与旧扁平状态，不回写输入', () => {
    const state = execution([fact('known')]);
    const before = JSON.stringify(state);
    expect(summary(state, { costStatus: 'unknown' })).toMatchObject({
      status: 'complete',
      currency: 'USD',
      knownAmount: '0',
      reason: null,
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('配置估算零和未结算预留都不能变成实际已知零费用', () => {
    for (const state of [execution([fact('estimated')]), execution([null])])
      expect(summary(state)).toMatchObject({
        status: 'partial',
        knownAmount: null,
        reason: 'unknown_cost',
      });
  });

  it('逐请求取最新修订并汇总，不叠加同一请求的旧修订', () => {
    const state = execution([fact('known', '1'), fact('known', '0.2')]);
    const first = state.requests[0]!;
    first.usageRevisions.push({
      ...first.usageRevisions[0]!,
      revision: 2,
      cost: fact('known', '2'),
    });
    first.settledRevision = 2;
    expect(summary(state)).toMatchObject({ status: 'complete', knownAmount: '2.2' });
  });

  it('保留已知部分，同时把其他未知请求留为部分结果', () => {
    expect(summary(execution([fact('known', '0.2'), null]))).toMatchObject({
      status: 'partial',
      knownAmount: '0.2',
      reason: 'unknown_cost',
    });
  });

  it('外部结果未知时已报告部分金额仍不代表全部费用已知', () => {
    const state = execution([fact('known', '0.2')]);
    state.requests[0]!.state = 'unknown';
    expect(summary(state)).toMatchObject({
      status: 'partial',
      knownAmount: '0.2',
      reason: 'unknown_cost',
    });
  });

  it('不同请求的币种分列，不能直接加成同一金额', () => {
    expect(summary(execution([fact('known', '1'), fact('known', '2', 'HKD')]))).toMatchObject({
      status: 'mixed_currency',
      currency: null,
      knownAmount: null,
      knownByCurrency: [
        { currency: 'USD', amount: '1' },
        { currency: 'HKD', amount: '2' },
      ],
    });
  });

  it('损坏 SDK 账本不能采用旧扁平零费用作为后备', () => {
    expect(
      summary({ version: 'sdk-execution-v1' }, { costStatus: 'known', costCurrency: 'USD' }),
    ).toMatchObject({
      status: 'partial',
      knownAmount: null,
      reason: 'unknown_currency',
    });
  });
});
