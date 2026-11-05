import { describe, expect, it, vi } from 'vitest';
import { indicatorEngineChanged } from '../../src/backtest/backtest-indicator-engine-version.js';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';

describe('指标计算版本与旧 Run 保护', () => {
  it('识别已绑定的本地版本差异，保留 NAV 与未执行的新 Run', () => {
    expect(
      indicatorEngineChanged(
        'thesis-ledger-v3-local-runner-v2',
        'thesis-ledger-v3-local-runner-v3',
      ),
    ).toBe(true);
    expect(indicatorEngineChanged(null, 'thesis-ledger-v3-local-runner-v3')).toBe(false);
    expect(indicatorEngineChanged('nav-v3', 'thesis-ledger-v3-local-runner-v3')).toBe(false);
    expect(
      indicatorEngineChanged(
        'thesis-ledger-v3-local-runner-v3',
        'thesis-ledger-v3-local-runner-v3',
      ),
    ).toBe(false);
  });

  it.each(['queued', 'succeeded', 'failed', 'cancelled'])(
    '旧 %s Run 不使用新内核重算或覆盖结果',
    async (status) => {
      const old = {
        id: 'old',
        mode: 'V3',
        status,
        input: { contractVersion: 3, schemaVersion: '3' },
        executionAttempt: 1,
        engineVersion: 'thesis-ledger-v3-local-runner-v2',
        result: { original: true },
        resultChecksum: 'original',
      };
      let current = { ...old };
      const updateMany = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        current = { ...current, ...data };
        return { count: 1 };
      });
      const execute = vi.fn();
      await runBacktestAttempt({
        prisma: { backtestJob: { updateMany, findUnique: async () => current } } as never,
        job: old as never,
        runnerId: 'thesis-ledger-v3-local-runner-v3',
        activeControllers: new Map(),
        execute,
        classifyFailure: () => ({ code: 'unexpected', summary: 'unexpected', retryable: false }),
      });
      expect(execute).not.toHaveBeenCalled();
      expect(current.engineVersion).toBe(old.engineVersion);
      expect(current.result).toEqual(old.result);
      expect(current.resultChecksum).toBe('original');
      if (status === 'queued') {
        expect(current.status).toBe('failed');
        expect(updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ errorCode: 'INDICATOR_ENGINE_VERSION_CHANGED' }),
          }),
        );
      } else expect(updateMany).not.toHaveBeenCalled();
    },
  );
});
