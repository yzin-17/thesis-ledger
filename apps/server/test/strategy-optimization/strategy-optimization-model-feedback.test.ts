import { describe, expect, it, vi } from 'vitest';
import { describeStrategyParameters } from '../../src/strategy-optimization/strategy-optimization-parameters.js';
import { strategyOptimizationPrompt } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { optimizationModelMetrics } from '../../src/strategy-optimization/strategy-optimization-model-feedback.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';

describe('模型反馈封存投影', () => {
  it.each([
    ['existing', true],
    ['discovery', true],
    ['discovery', false],
  ] as const)(
    '%s SDK=%s 的实际messages不包含封存结果或未来元数据',
    async (sourceMode, useSdkContract) => {
      const { input } = await completeSnapshotFixture();
      const descriptors = describeStrategyParameters(input.strategy);
      const descriptor = descriptors[0]!;
      const metrics = {
        development: {
          status: 'valid',
          completeness: 'complete',
          totalReturn: '-0.1',
          maxDrawdown: '0.2',
          tradeCount: 3,
          futureHigh: 'sealed-high',
          eventCount: 'sealed-events',
          reason: 'sealed-free-text',
          runId: 'sealed-run',
        },
        validation: {
          status: 'invalid',
          completeness: 'unavailable',
          tradeCount: 0,
          reason: '2035-01-02 sealed-date',
          bars: 'sealed-bars',
        },
        test: { status: 'valid', totalReturn: 'sealed-return' },
        overall: { futureExtreme: 'sealed-extreme' },
      };
      const experiment = {
        id: '11111111-1111-4111-8111-111111111111',
        sourceMode,
        allowedParameterIds: [descriptor.parameterId],
        objective: { mode: 'return' },
        runConfig: input.runConfig,
        baselineMetrics: metrics,
        strategySpaceVersion: 'strategy-space-v1',
        discoveryScope: {
          executionInstrument: input.strategy.executionInstrument,
          primaryTimeframe: '1d',
        },
      };
      const messages = await strategyOptimizationPrompt({
        prisma: {
          $queryRaw: vi.fn(async () => [
            {
              metrics,
              diff: [
                {
                  parameterId: descriptor.parameterId,
                  before: descriptor.currentValue,
                  after: descriptor.currentValue,
                  label: 'sealed-label',
                  metadata: 'sealed-diff',
                },
              ],
            },
          ]),
        } as never,
        experiment: experiment as never,
        strategy: input.strategy,
        descriptors,
        modelKey: 'fixture',
        round: 2,
        useSdkContract,
      });
      const actualRequest = JSON.stringify(messages);
      expect(actualRequest).not.toContain('sealed-');
      expect(actualRequest).not.toContain('2035-01-02');
      expect(actualRequest).not.toContain('futureHigh');
      expect(actualRequest).not.toContain('"test"');
      expect(actualRequest).toContain('-0.1');
      expect(actualRequest).toContain('不得描述为严格无前视样本外');
      const user = messages.find((message) => message.role === 'user')!;
      const payload = JSON.parse(user.content.slice(user.content.indexOf(':') + 1));
      expect(payload.priorCandidates[0].metrics.validation).not.toHaveProperty('totalReturn');
      expect(payload.priorCandidates[0].metrics).toEqual({
        development: {
          status: 'valid',
          completeness: 'complete',
          totalReturn: '-0.1',
          maxDrawdown: '0.2',
          tradeCount: 3,
        },
        validation: { status: 'invalid', completeness: 'unavailable', tradeCount: 0 },
      });
    },
  );

  it('非法指标不转成零收益或允许未知字段通过', () => {
    expect(
      optimizationModelMetrics({
        development: { status: 'valid', totalReturn: 'future-date' },
        test: { status: 'valid', totalReturn: '0.9' },
      }),
    ).toEqual({});
    expect(
      optimizationModelMetrics({
        validation: { status: 'invalid', failureCategory: 'data-unavailable' },
      }),
    ).toEqual({ validation: { status: 'invalid', failureCategory: 'data-unavailable' } });
  });
});
