import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiExecutionSummarySchema, DEFAULT_AI_RESEARCH_POLICY_V1 } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { claimAiRun } from '../../src/ai/ai-run-claim.js';
import {
  queuedResearchClock,
  researchExecutionDeadline,
  startResearchClock,
} from '../../src/ai/timeout/ai-execution-clock.js';
import { parseAiResearchPolicy } from '../../src/ai/ai-research-policy.js';

const epoch = Date.parse('2026-10-27T00:00:00Z');
const policy = { ...DEFAULT_AI_RESEARCH_POLICY_V1, maxDurationSeconds: 600 };
const summary = () =>
  aiExecutionSummarySchema.parse({
    version: 'sdk-execution-v1',
    contract: { id: 'research', version: 'research-generation-v2' },
    frozenPolicy: policy,
    deadlineAt: null,
    timing: queuedResearchClock(policy, {}, epoch),
    generationStatus: 'pending',
    usageCompleteness: 'unknown',
    requests: [],
    continuationBlockedReason: null,
  });
const claim = (execution = summary(), startedAt: Date | null = null, attempt = 0, now = epoch) =>
  startResearchClock({ execution, firstStartedAt: startedAt, executionAttempt: attempt, now });

function database(execution = summary()) {
  const row = {
    id: '10000000-0000-4000-8000-000000000001',
    status: 'queued',
    executionAttempt: 0,
    startedAt: null as Date | null,
    modelMetadata: { unrelated: '保留', sdkExecution: execution },
  };
  const transaction = {
    $queryRaw: vi.fn(async () => [row]),
    aiRun: {
      updateMany: vi.fn(
        async (input: {
          where: { status: string; executionAttempt: number };
          data: Record<string, unknown>;
        }) => {
          if (
            row.status !== input.where.status ||
            row.executionAttempt !== input.where.executionAttempt
          )
            return { count: 0 };
          const next = input.data.executionAttempt
            ? row.executionAttempt + 1
            : row.executionAttempt;
          Object.assign(row, input.data, { executionAttempt: next });
          return { count: 1 };
        },
      ),
      findUnique: vi.fn(async () => ({ ...row })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (execute: (value: typeof transaction) => Promise<unknown>) =>
      execute(transaction),
    ),
  };
  return { row, transaction, prisma: prisma as unknown as PrismaService };
}

describe('首次执行与恢复的持久化时钟', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
  });
  afterEach(() => vi.useRealTimers());

  it('排队不消耗执行预算，首次领取才确定截止时间', () => {
    const started = claim(summary(), null, 0, epoch + 300_000)!;
    expect(started.timing?.firstStartedAt).toBe(new Date(epoch + 300_000).toISOString());
    expect(started.deadlineAt).toBe(new Date(epoch + 900_000).toISOString());
    expect(researchExecutionDeadline(started)).toBe(epoch + 895_000);
  });

  it('重试、重领及恢复均复用同一首次时钟', () => {
    const first = claim()!;
    const recovered = claim(first, new Date(epoch), 2, epoch + 200_000)!;
    expect(recovered.timing).toEqual(first.timing);
    expect(recovered.deadlineAt).toBe(first.deadlineAt);
  });

  it('有限排队过期不再领取', () => {
    expect(claim(summary(), null, 0, epoch + 600_000)).toBeNull();
  });

  it('旧截止时间优先保留，包括无法证明首次时间的旧排队任务', () => {
    const legacy = {
      ...summary(),
      timing: undefined,
      deadlineAt: new Date(epoch + 250_000).toISOString(),
    };
    const restored = claim(legacy, null, 0, epoch + 10_000)!;
    expect(restored.deadlineAt).toBe(legacy.deadlineAt);
    expect(restored.timing).toMatchObject({ origin: 'legacy_deadline', firstStartedAt: null });
  });

  it('无截止时间的历史任务只能从原首次时间和原预算恢复', () => {
    const legacy = { ...summary(), timing: undefined };
    expect(claim(legacy, new Date(epoch), 2, epoch + 100_000)?.deadlineAt).toBe(
      new Date(epoch + 600_000).toISOString(),
    );
    expect(() => claim(legacy, null, 2)).toThrow('缺少首次执行时间');
  });

  it('检测不同持久化截止字段冲突，不选择较晚者', () => {
    const first = claim()!;
    expect(() => claim({ ...first, deadlineAt: new Date(epoch + 700_000).toISOString() })).toThrow(
      '不一致',
    );
  });

  it('深度缺省为20分钟，明确旧预算不被档位替换', () => {
    expect(parseAiResearchPolicy(undefined, 'deep_research').maxDurationSeconds).toBe(1200);
    expect(
      parseAiResearchPolicy('{"maxDurationSeconds":300}', 'deep_research').maxDurationSeconds,
    ).toBe(300);
  });

  it('行锁事务同时提交首次时钟／attempt／租约，重复领取拒绝', async () => {
    const db = database();
    vi.setSystemTime(epoch + 100_000);
    const first = await claimAiRun(db.prisma, db.row.id, 60_000);
    expect(db.transaction.$queryRaw.mock.calls).toHaveLength(1);
    expect(db.transaction.aiRun.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      status: 'queued',
      executionAttempt: 0,
    });
    expect(first?.startedAt).toEqual(new Date(epoch + 100_000));
    expect(first?.modelMetadata).toMatchObject({
      unrelated: '保留',
      sdkExecution: { deadlineAt: new Date(epoch + 700_000).toISOString() },
    });
    expect(await claimAiRun(db.prisma, db.row.id, 60_000)).toBeNull();
    expect(db.row.executionAttempt).toBe(1);
  });

  it('过期排队在同一事务收敛failed，不创建新执行代次', async () => {
    const db = database();
    vi.setSystemTime(epoch + 600_000);
    expect(await claimAiRun(db.prisma, db.row.id, 60_000)).toBeNull();
    expect(db.row).toMatchObject({
      status: 'failed',
      executionAttempt: 0,
      errorCode: 'research_queue_expired',
    });
  });

  it('恢复领取保留数据库startedAt及原截止，不给新预算', async () => {
    const first = claim()!,
      db = database(first);
    db.row.startedAt = new Date(epoch);
    db.row.executionAttempt = 1;
    vi.setSystemTime(epoch + 200_000);
    const restored = await claimAiRun(db.prisma, db.row.id, 60_000);
    expect(restored?.startedAt).toEqual(new Date(epoch));
    expect(restored?.modelMetadata).toMatchObject({
      sdkExecution: { deadlineAt: first.deadlineAt },
    });
  });
});
