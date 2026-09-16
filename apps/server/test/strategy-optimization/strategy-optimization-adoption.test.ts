import { describe, expect, it, vi } from 'vitest';
import { formalizeOptimizationCandidate } from '../../src/strategy-optimization/strategy-optimization-adoption.js';
import type { CandidateRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';

const discoverySchema = {
  ...createDiscoverySeed({
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
  }),
  name: '模型探索策略',
  description: '模型生成的说明',
};

const candidate = {
  id: '11111111-1111-4111-8111-111111111111',
  candidateStrategyVersionId: '22222222-2222-4222-8222-222222222222',
  experimentId: '33333333-3333-4333-8333-333333333333',
  executionHash: 'hash',
} as CandidateRow;

describe('策略探索采纳', () => {
  it('在同一事务内把隐藏策略转为 draft 并发布正式 v1', async () => {
    const formal = { id: '44444444-4444-4444-8444-444444444444', version: 1 };
    const transaction = {
      strategy: { update: vi.fn() },
      strategyVersion: { create: vi.fn().mockResolvedValue(formal) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      strategyVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: candidate.candidateStrategyVersionId,
          strategyId: '55555555-5555-4555-8555-555555555555',
          schema: discoverySchema,
        }),
        aggregate: vi.fn().mockResolvedValue({ _max: { version: null } }),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    await formalizeOptimizationCandidate(
      prisma as never,
      candidate.experimentId,
      candidate,
      0,
      'adopt-discovery',
      'discovery',
    );
    expect(transaction.strategy.update).toHaveBeenCalledWith({
      where: { id: '55555555-5555-4555-8555-555555555555' },
      data: { status: 'draft', name: '模型探索策略', description: '模型生成的说明' },
    });
    expect(transaction.strategyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
    );
  });
});
