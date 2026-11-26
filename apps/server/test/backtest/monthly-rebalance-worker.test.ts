import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import {
  fixedMonthlyPlan,
  monthlyScenario,
  monthlyExecutionConforms,
} from './monthly-rebalance.fixture.js';

it.each([false, true])(
  '正式冻结与 Worker 月末调仓=%s，不读取新行情且重复回放完整一致',
  async (enabled) => {
    const root = mkdtempSync(join(tmpdir(), 'monthly-worker-'));
    try {
      const fixture = await tradePlanSnapshot(root, fixedMonthlyPlan(enabled), monthlyScenario);
      const request = fixture.fixture.dsa.backtestCalendar.mock.calls[0]![0];
      expect(request.start).toBe(enabled ? '2026-05-01' : fixture.built.manifest.warmup.startDate);
      if (enabled) expect(request.end).toBe('2026-09-30');
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
      const execution = fixture.execute();
      expect(
        monthlyExecutionConforms(
          enabled ? 'month-end-rebalance' : 'initial-allocation',
          execution.fills,
        ),
        JSON.stringify({ fills: execution.fills, rejects: execution.rejects }),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  30000,
);
