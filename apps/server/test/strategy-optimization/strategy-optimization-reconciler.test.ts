import { describe, expect, it, vi } from 'vitest';
import { StrategyOptimizationReconciler } from '../../src/strategy-optimization/strategy-optimization-reconciler.service.js';

describe('StrategyOptimizationReconciler', () => {
  it('周期恢复会批量调度可恢复实验', async () => {
    const optimization = { reconcilePending: vi.fn(async () => ({ scheduled: 12 })) };
    const reconciler = new StrategyOptimizationReconciler(optimization as never);

    await expect(reconciler.runNow()).resolves.toEqual({ skipped: false, scheduled: 12 });
    expect(optimization.reconcilePending).toHaveBeenCalledWith(100);
  });

  it('上一轮仍在运行时不重入', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const optimization = {
      reconcilePending: vi.fn(async () => {
        await pending;
        return { scheduled: 1 };
      }),
    };
    const reconciler = new StrategyOptimizationReconciler(optimization as never);

    const first = reconciler.runNow();
    await expect(reconciler.runNow()).resolves.toEqual({
      skipped: true,
      reason: '策略优化恢复上一轮仍在运行',
    });
    release?.();
    await expect(first).resolves.toEqual({ skipped: false, scheduled: 1 });
  });
});
