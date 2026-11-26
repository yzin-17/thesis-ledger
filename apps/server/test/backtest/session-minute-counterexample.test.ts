import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fixedSessionPlan, sessionVwapSnapshot } from './session-vwap-snapshot.fixture.js';

it.each(['eq', 'gte'] as const)(
  '第31分钟不满足、32分钟满足时，冻结执行区分时间条件 %s',
  async (operator) => {
    const root = mkdtempSync(join(tmpdir(), 'session-minute-counterexample-'));
    try {
      const strategy = fixedSessionPlan(true);
      if (strategy.entry.type !== 'all') throw new Error('缺少固定条件');
      const minute = strategy.entry.conditions[2]!;
      if (minute.type !== 'compare') throw new Error('缺少固定时间比较');
      minute.operator = operator;
      // 前30分钟均价约133；第31分钟90不满足，第32分钟140满足。
      const fixture = await sessionVwapSnapshot(root, strategy, { 31: 90 });
      const execution = fixture.execute();
      expect(execution.fills).toHaveLength(operator === 'eq' ? 0 : 1);
      if (operator === 'gte')
        expect(execution.fills[0]).toMatchObject({
          side: 'buy',
          occurredAt: '2026-05-18T02:03:00.000Z',
        });
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  120000,
);

it.each([60, 61])(
  '首小时内仅在收盘价首次高于会话均价时买入，首次突破在第 %i 分钟',
  async (firstBreakout) => {
    const root = mkdtempSync(join(tmpdir(), 'session-hour-boundary-'));
    try {
      const strategy = fixedSessionPlan(true);
      if (strategy.entry.type !== 'all') throw new Error('缺少固定条件');
      // 只保留价格、首小时和空仓条件，让边界由正式会话时钟决定。
      strategy.entry.conditions = strategy.entry.conditions.filter(
        (condition) => !(condition.type === 'compare' && condition.operator === 'eq'),
      );
      const prices = Object.fromEntries(
        Array.from({ length: firstBreakout }, (_, index) => [
          index + 1,
          index + 1 === firstBreakout ? 200 : 100,
        ]),
      );
      const fixture = await sessionVwapSnapshot(root, strategy, prices);
      const { fills } = fixture.execute();
      expect(fills).toHaveLength(firstBreakout === 60 ? 1 : 0);
      if (firstBreakout === 60)
        expect(fills[0]).toMatchObject({ side: 'buy', occurredAt: '2026-05-18T02:31:00.000Z' });
      const result = await fixture.run();
      expect(await fixture.run()).toEqual(result);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  120000,
);
