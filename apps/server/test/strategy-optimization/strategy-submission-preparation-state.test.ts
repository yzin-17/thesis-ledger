import { expect, it, vi } from 'vitest';
import { strategySubmissionInputSchema } from '@thesis-ledger/schemas';
import { StrategySubmissions } from '../../src/strategy-optimization/strategy-submissions.js';
import { navPreparationFixture } from '../backtest/nav-preparation.fixtures.js';

it.each(['preparing', 'blocked', 'confirm', 'ready', 'timeout'] as const)(
  '已领取提交按原准备结果 %s 收敛，写入保持 attempt 和阶段条件',
  async (status) => {
    const input = strategySubmissionInputSchema.parse({
      kind: 'nav',
      preparation: navPreparationFixture().request,
    });
    const row = {
      id: 'controlled-submission',
      ownerId: 'owner',
      kind: 'nav',
      state: 'queued',
      attempt: status === 'timeout' ? 60 : 0,
      input,
      outcome: null,
      prepared: null,
    };
    const prepared = { status: 'prepared', receipt: { preparationHash: 'controlled-proof' } };
    let result: unknown = prepared;
    if (status === 'preparing' || status === 'timeout') result = { status: 'preparing' };
    else if (status === 'blocked') result = { status: 'blocked', diagnostics: [] };
    const execution = {
      authorize: vi.fn(),
      prepare: vi.fn().mockResolvedValue(result),
      requiresConfirmation: vi.fn().mockReturnValue(status === 'confirm'),
      create: vi.fn(),
    };
    const update = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      strategySubmission: { findMany: vi.fn().mockResolvedValue([row]), updateMany: update },
    };
    await new StrategySubmissions(db as never, execution as never).run(
      new Date('2026-11-12T16:00:00Z'),
    );
    expect(execution.prepare).toHaveBeenCalledWith(input);
    expect(execution.create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: row.id, state: 'queued', attempt: row.attempt },
      data: { state: 'preparing', attempt: { increment: 1 } },
    });
    let next = 'ready';
    if (status === 'preparing') next = 'queued';
    else if (status === 'blocked' || status === 'timeout') next = 'blocked';
    else if (status === 'confirm') next = 'awaiting_confirmation';
    expect(update.mock.calls[1]?.[0]).toMatchObject({
      where: { id: row.id, state: 'preparing', attempt: row.attempt + 1 },
      data: { state: next },
    });
    if (status === 'confirm' || status === 'ready')
      expect(update.mock.calls[1]?.[0].data.prepared).toEqual(prepared);
    if (status === 'timeout')
      expect(update.mock.calls[1]?.[0].data.outcome.reason).toBe('公告准备超时');
  },
);
