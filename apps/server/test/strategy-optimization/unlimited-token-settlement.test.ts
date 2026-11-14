import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationAiSettlementStore } from '../../src/strategy-optimization/strategy-optimization-ai-settlement.store.js';

describe('Token 零值的 SDK 用量结算', () => {
  it.each([
    { maxInputTokens: 0, maxOutputTokens: 0, maxCost: '1', expected: null },
    { maxInputTokens: 100, maxOutputTokens: 0, maxCost: '1', expected: 'budget_exceeded' },
    { maxInputTokens: 0, maxOutputTokens: 100, maxCost: '1', expected: 'budget_exceeded' },
    { maxInputTokens: 200, maxOutputTokens: 300, maxCost: '1', expected: null },
    { maxInputTokens: 0, maxOutputTokens: 0, maxCost: '0', expected: 'budget_exceeded' },
  ])(
    '按独立预算结算 $maxInputTokens / $maxOutputTokens / $maxCost',
    async ({ expected, ...budget }) => {
      const transaction = {
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 'attempt', experimentId: 'experiment', aiRunId: 'run', status: 'running' },
          ])
          .mockResolvedValueOnce([
            { inputTokensUsed: 20, outputTokensUsed: 20, costUsed: new Prisma.Decimal(0), budget },
          ]),
        $executeRaw: vi.fn().mockResolvedValue(1),
      };
      const request = {
        settledRevision: 0,
        reservation: { inputTokens: 20, outputTokens: 20, cost: { amount: '0', currency: 'USD' } },
        usageRevisions: [
          {
            usage: { inputTokens: 150, outputTokens: 250 },
            cost: { status: 'reported', amount: '0.5', currency: 'USD' },
          },
        ],
      };
      const executions = {
        completeAndSettle: vi.fn(
          async (input: unknown, hooks: { settle: (input: unknown) => Promise<unknown> }) => {
            void input;
            return hooks.settle({ transaction, runId: 'run', request, revision: 1 });
          },
        ),
      };
      const store = new StrategyOptimizationAiSettlementStore(executions as never);
      expect(await store.completeAndSettle({ attemptId: 'attempt' } as never)).toBe(expected);
      const sql = transaction.$executeRaw.mock.calls[0]?.[0] as Prisma.Sql;
      expect(sql.values).toEqual(expect.arrayContaining([150, 250]));
    },
  );
});
