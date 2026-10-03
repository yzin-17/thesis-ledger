import { describe, expect, it } from 'vitest';
import type { BacktestCorporateActionFact } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { requireV3EventSignalVisibility } from './backtest-v3-event-signal-clock.js';

const tick = { occurredAt: '2026-07-10T07:00:00.123456Z', tradingDate: '2026-07-10' };
const fact: BacktestCorporateActionFact = {
  symbol: '159516.SZ',
  market: 'CN',
  instrumentType: 'ETF',
  type: 'SPLIT',
  effectiveDate: '2026-07-10',
  ratio: '2',
  occurredAt: '2026-07-10T00:00:00+08:00',
  availableAt: '2026-07-10T07:00:00.123456Z',
  strategyVisibility: { kind: 'announcement', announcedAt: '2026-07-10T15:00:00.123456+08:00' },
  provider: 'fixture',
  providerRevision: 'r1',
};
const strategy = {
  entry: { type: 'corporateActionEvent' as const, eventType: 'SPLIT' as const },
  exit: { type: 'positionState' as const, field: 'isOpen' as const },
};
const requireVisible = (
  candidate: BacktestCorporateActionFact,
  selected: Pick<BacktestStrategy, 'entry' | 'exit'> = strategy,
) =>
  requireV3EventSignalVisibility({
    strategy: selected,
    facts: [candidate],
    ticks: [tick],
    symbol: fact.symbol,
    market: fact.market,
  });

describe('V3 公司行动信号决策时钟', () => {
  it('相同瞬时且带时区偏移的可用事实与公告通过', () => {
    expect(() => requireVisible(fact)).not.toThrow();
  });

  it('同毫秒内晚一微秒的事实或公告均阻断', () => {
    expect(() => requireVisible({ ...fact, availableAt: '2026-07-10T07:00:00.123457Z' })).toThrow(
      'DATA_UNAVAILABLE',
    );
    expect(() =>
      requireVisible({
        ...fact,
        strategyVisibility: {
          kind: 'announcement',
          announcedAt: '2026-07-10T15:00:00.123457+08:00',
        },
      }),
    ).toThrow('DATA_UNAVAILABLE');
  });

  it('非法瞬时失败关闭，保守日同日仍不可见', () => {
    expect(() => requireVisible({ ...fact, availableAt: '2026-07-10T07:00:00-00:00' })).toThrow(
      'DATA_UNAVAILABLE',
    );
    expect(() =>
      requireVisible({
        ...fact,
        strategyVisibility: { kind: 'conservative-day', visibleDate: '2026-07-10' },
      }),
    ).toThrow('DATA_UNAVAILABLE');
  });

  it('同一交易日有多个 tick 时按最早决策时刻限制', () => {
    expect(() =>
      requireV3EventSignalVisibility({
        strategy,
        facts: [fact],
        ticks: [tick, { ...tick, occurredAt: '2026-07-10T07:00:00.123455Z' }],
        symbol: fact.symbol,
        market: fact.market,
      }),
    ).toThrow('DATA_UNAVAILABLE');
  });

  it('无事件表达式及无匹配生效日不会扩大取数要求', () => {
    expect(() =>
      requireVisible(
        { ...fact, availableAt: '2026-07-10T07:00:00.123457Z' },
        { entry: { type: 'positionState', field: 'isOpen' }, exit: strategy.exit },
      ),
    ).not.toThrow();
    expect(() => requireVisible({ ...fact, effectiveDate: '2026-07-11' })).not.toThrow();
  });
});
