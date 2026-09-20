import { describe, expect, it } from 'vitest';
import type { AiExecutionReadModel } from '@thesis-ledger/schemas';
import { aiExecutionDisplay } from '../src/features/ai/ai-execution-display.js';

const request = (
  overrides: Partial<AiExecutionReadModel['requests'][number]> = {},
): AiExecutionReadModel['requests'][number] => ({
  requestId: '11111111-1111-4111-8111-111111111111',
  sequence: 1,
  state: 'completed',
  reservation: {
    aiCalls: 1,
    inputTokens: 100,
    outputTokens: 20,
    cost: {
      status: 'estimated',
      amount: '0.25',
      currency: 'USD',
      source: 'frozen-price',
      pricingVersion: 'v1',
    },
  },
  preparedAt: '2026-09-19T00:00:00.000Z',
  dispatchingAt: '2026-09-19T00:00:01.000Z',
  completedAt: '2026-09-19T00:00:02.000Z',
  outcome: {
    status: 'complete',
    finishReason: 'stop',
    contract: { id: 'research', version: 'research-generation-v1' },
    schemaAccepted: true,
  },
  error: null,
  usage: { status: 'partial', inputTokens: 80, outputTokens: null },
  cost: {
    status: 'estimated',
    amount: '0.2',
    currency: 'USD',
    source: 'frozen-price',
    pricingVersion: 'v1',
  },
  ...overrides,
});

const execution = (overrides: Partial<AiExecutionReadModel> = {}): AiExecutionReadModel => ({
  version: 'sdk-execution-v1',
  contract: { id: 'research', version: 'research-generation-v1' },
  frozenPolicy: {
    version: 'research-policy-v1',
    maxAiCalls: 2,
    maxInputTokens: 100000,
    maxOutputTokens: 20000,
    maxDurationSeconds: 300,
    maxCost: '0',
    costCurrency: null,
    paidRoutes: [],
  },
  deadlineAt: '2026-09-19T00:05:00.000Z',
  generationStatus: 'complete',
  usageCompleteness: 'partial',
  requests: [request()],
  continuationBlockedReason: null,
  ...overrides,
});

describe('AI 执行事实展示', () => {
  it('历史默认零值不冒充确定消耗', () => {
    expect(aiExecutionDisplay(null, { inputTokens: 0, outputTokens: 0 })).toMatchObject({
      completenessLabel: '历史未核对',
      tokenText: '历史未核对',
      costLines: ['历史费用未核对'],
    });
  });

  it('部分用量、估算费用和未确认预留保留各自语义', () => {
    const display = aiExecutionDisplay(execution());
    expect(display.tokenText).toBe('已报告 80 / 未知');
    expect(display.costLines).toEqual(['估算（非实付） USD 0.2']);
    expect(display.reservationLines).toEqual([
      '未确认 Token 预留 100 / 20',
      '未确认费用预留 USD 0.25',
    ]);
    expect(display.policyLines).toContain('费用上限 0，仅允许具有免费依据的路由');
  });

  it('不同币种分开显示，超预算只停止后续执行而不抹除结果事实', () => {
    const display = aiExecutionDisplay(
      execution({
        usageCompleteness: 'reported',
        continuationBlockedReason: 'budget_exceeded',
        requests: [
          request({
            usage: { status: 'reported', inputTokens: 1, outputTokens: 2 },
            cost: {
              status: 'known',
              amount: '1.5',
              currency: 'USD',
              source: 'provider',
              pricingVersion: null,
            },
          }),
          request({
            requestId: '22222222-2222-4222-8222-222222222222',
            sequence: 2,
            usage: { status: 'reported', inputTokens: 3, outputTokens: 4 },
            cost: {
              status: 'known',
              amount: '8',
              currency: 'CNY',
              source: 'provider',
              pricingVersion: null,
            },
          }),
        ],
      }),
    );
    expect(display.tokenText).toBe('4 / 6');
    expect(display.costLines).toEqual(['已确认 CNY 8', '已确认 USD 1.5']);
    expect(display.blockedReason).toContain('合法结果仍保留');
  });
});
