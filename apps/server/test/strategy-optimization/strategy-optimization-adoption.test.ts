import { describe, expect, it, vi } from 'vitest';
import { formalizeOptimizationCandidate } from '../../src/strategy-optimization/strategy-optimization-adoption.js';
import { optimizationSha256 } from '../../src/strategy-optimization/strategy-optimization-common.js';
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
  executionHash: optimizationSha256(discoverySchema),
} as CandidateRow;

describe('策略探索采纳', () => {
  it('在同一事务内把隐藏策略转为 draft 并发布正式 v1', async () => {
    const formal = { id: '44444444-4444-4444-8444-444444444444', version: 1 };
    const facts = {
      id: candidate.id,
      experimentId: candidate.experimentId,
      candidateStrategyVersionId: candidate.candidateStrategyVersionId,
      executionHash: candidate.executionHash,
      validationStatus: 'test_valid',
      adoptedStrategyVersionId: null,
      candidateStrategyId: '55555555-5555-4555-8555-555555555555',
      candidateVersion: 0,
      candidateSchemaVersion: 2,
      candidateSchema: discoverySchema,
      sourceMode: 'discovery',
      experimentStatus: 'succeeded',
      experimentStage: 'completed',
      testExposedAt: new Date(),
      exposure: { testRevealed: true },
      baselineStrategyVersionId: candidate.candidateStrategyVersionId,
    };
    const adoption = {
      id: '66666666-6666-4666-8666-666666666666',
      experimentId: candidate.experimentId,
      candidateId: candidate.id,
      idempotencyKey: 'adopt-discovery',
      candidateHash: candidate.executionHash,
      formalStrategyVersionId: formal.id,
      baselineStrategyVersionId: candidate.candidateStrategyVersionId,
      confirmedCurrentStrategyVersionId: null,
    };
    const transaction = {
      strategy: { update: vi.fn() },
      strategyVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: candidate.candidateStrategyVersionId,
          strategyId: facts.candidateStrategyId,
          version: 0,
          schemaVersion: 2,
        }),
        create: vi.fn().mockResolvedValue(formal),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([facts])
        .mockResolvedValueOnce([facts])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([adoption]),
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
      candidate.id,
      candidate.executionHash,
      0,
      'adopt-discovery',
    );
    expect(transaction.strategy.update).toHaveBeenCalledWith({
      where: { id: '55555555-5555-4555-8555-555555555555' },
      data: { status: 'draft', name: '模型探索策略', description: '模型生成的说明' },
    });
    expect(transaction.strategyVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1 }) }),
    );
  });

  it('同一幂等键绑定不同确认版本时拒绝重放', async () => {
    const adoption = {
      id: '66666666-6666-4666-8666-666666666666',
      experimentId: candidate.experimentId,
      candidateId: candidate.id,
      idempotencyKey: 'adopt-existing',
      candidateHash: candidate.executionHash,
      formalStrategyVersionId: '77777777-7777-4777-8777-777777777777',
      baselineStrategyVersionId: '88888888-8888-4888-8888-888888888888',
      confirmedCurrentStrategyVersionId: '99999999-9999-4999-8999-999999999999',
    };
    const transaction = {
      $executeRaw: vi.fn(),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([adoption])
        .mockResolvedValueOnce([{ sourceMode: 'existing' }])
        .mockResolvedValueOnce([{ version: 2 }]),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };

    await expect(
      formalizeOptimizationCandidate(
        prisma as never,
        candidate.experimentId,
        candidate.id,
        candidate.executionHash,
        1,
        adoption.idempotencyKey,
      ),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_IDEMPOTENCY_CONFLICT' } });
  });
});
