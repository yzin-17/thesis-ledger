import { describe, expect, it, vi } from 'vitest';
import { backtestHasExecutionHistory, backtestRunnerIdentity, indicatorEngineChanged } from '../../src/backtest/backtest-indicator-engine-version.js';
import { runBacktestAttempt } from '../../src/backtest/backtest-run-attempt.js';

describe('指标计算版本与旧 Run 保护', () => {
  it('未装配执行器稳定终止queued意图，不绑定占位身份或增加attempt', async () => {
    const old = { id: 'unavailable', mode: 'frozen', status: 'queued', executionAttempt: 0,
      engineVersion: null, input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1' } };
    let current: Record<string, unknown> = { ...old };
    const execute = vi.fn();
    await runBacktestAttempt({ prisma: { backtestJob: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { current = { ...current, ...data }; return { count: 1 }; },
      findUnique: async () => current,
    } } as never, job: old as never, runnerId: undefined, activeControllers: new Map(), execute,
      classifyFailure: () => ({ code: 'unexpected', summary: 'unexpected', retryable: false }) });
    expect(current).toMatchObject({ status: 'failed', engineVersion: null, executionAttempt: 0,
      errorCode: 'BACKTEST_RUNNER_UNAVAILABLE' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('完整比较股票、NAV与自定义执行器身份，只允许首次绑定', () => {
    expect(
      indicatorEngineChanged(
        'thesis-ledger-v3-local-runner-v2',
        'thesis-ledger-v3-local-runner-v3',
      ),
    ).toBe(true);
    expect(indicatorEngineChanged(null, 'thesis-ledger-v3-local-runner-v3')).toBe(false);
    expect(indicatorEngineChanged('nav-v3', 'thesis-ledger-v3-local-runner-v3')).toBe(true);
    expect(indicatorEngineChanged('nav-v1', 'nav-v2')).toBe(true);
    expect(indicatorEngineChanged('custom-a', 'custom-b')).toBe(true);
    expect(indicatorEngineChanged(null, 'nav-v2', 1)).toBe(true);
    expect(backtestRunnerIdentity(null, undefined)).toBe('unavailable');
    expect(backtestRunnerIdentity(null, 'nav-v2', true)).toBe('unknown-executed');
    expect(backtestHasExecutionHistory({ executionAttempt: 0, input: { retryAttemptBase: 3 } })).toBe(true);
    expect(backtestHasExecutionHistory({ executionAttempt: 0, input: {}, resultChecksum: 'old' })).toBe(true);
    expect(backtestHasExecutionHistory({ executionAttempt: 0, input: {} })).toBe(false);
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
        mode: 'frozen',
        status,
        input: { contractVersion: 1, schemaVersion: 'backtest-trade-run-v1' },
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
            data: expect.objectContaining({ errorCode: 'BACKTEST_RUNNER_VERSION_CHANGED' }),
          }),
        );
      } else expect(updateMany).not.toHaveBeenCalled();
    },
  );
});
