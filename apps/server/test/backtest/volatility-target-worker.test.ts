import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import { fixedVolatilityPlan, volatilityScenario } from './volatility-target.fixture.js';

it.each([false, true])(
  '正式冻结与 Worker 每日调仓=%s，不读取新行情且重复回放一致',
  async (enabled) => {
    const root = mkdtempSync(join(tmpdir(), 'volatility-worker-'));
    try {
      const fixture = await tradePlanSnapshot(
        root,
        fixedVolatilityPlan(enabled),
        volatilityScenario,
      );
      expect(fixture.built.manifest.warmup.lookbackPeriods).toBe(enabled ? 21 : 1);
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
      const execution = fixture.execute();
      expect(execution.fills[0]?.side).toBe('buy');
      if (enabled) {
        expect(execution.fills.some((fill) => fill.side === 'sell')).toBe(true);
        expect(execution.fills.filter((fill) => fill.side === 'buy').length).toBeGreaterThan(1);
      } else expect(execution.fills).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  // 一例执行两次完整 Worker 回放及一次实际引擎，包含连续数量的 40 位预算搜索。
  30000,
);
