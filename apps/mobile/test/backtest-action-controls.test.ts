import { expect, it } from 'vitest';
import { backtestActionControls, type MobileBacktestRun } from '../src/features/backtest-jobs/backtest-state';
const run: MobileBacktestRun = { id: 'run', strategyVersionId: 'version', mode: 'V3', status: 'running', executionAttempt: 1 };
const state = { busy: false, readFailed: false, pending: false, pendingKnown: true, reading: true };
it('同范围慢轮询不阻止取消，但终态重试等待读取完成', () => {
  expect(backtestActionControls(run, state)).toEqual({ cancel: true, retry: false });
  expect(backtestActionControls({ ...run, status: 'succeeded' }, state)).toEqual({ cancel: false, retry: false });
  expect(backtestActionControls({ ...run, status: 'succeeded' }, { ...state, reading: false })).toEqual({ cancel: false, retry: true });
});
it('失败读取、原操作待确认、忙碌及已登记取消仍禁止重复取消', () => {
  for (const patch of [{ busy: true }, { readFailed: true }, { pending: true }, { pendingKnown: false }])
    expect(backtestActionControls(run, { ...state, ...patch }).cancel).toBe(false);
  expect(backtestActionControls({ ...run, cancelRequestedAt: '2026-11-20T08:00:00Z' }, state).cancel).toBe(false);
});
