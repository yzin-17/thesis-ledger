import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { strategySchema } from '@thesis-ledger/schemas';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';
import {
  fixedLossPausePlan,
  lossPauseScenario,
  lossPausePlanConforms,
  lossPauseExecutionConforms,
} from './loss-pause-model.fixture.js';

it.each([false, true])('完整冻结快照与 Worker 回放：亏损窗口=%s', async (loss) => {
  const root = mkdtempSync(join(tmpdir(), 'loss-pause-worker-'));
  try {
    const strategy = fixedLossPausePlan(loss);
    expect(strategySchema.safeParse(strategy).success).toBe(true);
    const fixture = await tradePlanSnapshot(root, strategy, lossPauseScenario);
    const result = await fixture.run();
    expect(await fixture.run()).toEqual(result);
    const execution = fixture.execute();
    const id = loss ? 'loss-window' : 'bar-cooldown';
    expect(lossPausePlanConforms(id, strategy)).toBe(true);
    expect(
      execution.fills
        .filter((fill) => fill.side === 'buy')
        .map((fill) => fill.occurredAt.slice(0, 10)),
    ).toEqual((loss ? [1, 3, 5, 18, 31] : [1, 13, 25]).map((n) => lossPauseScenario.dates[n]));
    expect(lossPauseExecutionConforms(id, execution.fills)).toBe(true);
    const readback = backtestStrategyPlanReadback(strategy).join('\n');
    expect(readback).toContain(loss ? '现金分配单独记账' : '10 根');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
