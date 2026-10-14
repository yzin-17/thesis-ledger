import { describe, expect, it } from 'vitest';
import {
  projectTradeCostProjections,
  type LedgerEvent,
  type TradeCostStrategyRevision,
} from '../src/index.js';

const buy = (occurredAt: string): LedgerEvent => ({
  version: 3,
  eventId: 'buy',
  factId: 'buy',
  accountId: 'account',
  ledgerRevision: '1',
  type: 'BUY_EXECUTION',
  occurredAt,
  timePrecision: occurredAt.length === 10 ? 'DATE' : 'INSTANT',
  sourceTimezone: 'UTC',
  economicOrderKey: 'buy',
  recordedAt: '2030-02-01T00:00:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'cost-boundary-test' },
  actorId: 'test',
  revisionAction: 'CREATE',
  payload: {
    symbol: '000001.OF',
    quantity: '100',
    price: '1.25',
    currency: 'CNY',
    capabilityVerification: 'UNVERIFIED',
    charges: [],
  },
});

const strategy = (id: string, effectiveAt: string): TradeCostStrategyRevision => ({
  id,
  method: 'AVG',
  effectiveAt,
  reason: '成本策略边界验收',
  actorId: 'test',
});

const project = (occurredAt: string, revisions: TradeCostStrategyRevision[]) =>
  projectTradeCostProjections([buy(occurredAt)], {
    accountModeByAccountId: { account: 'actual' },
    costStrategyRevisionsByAccountId: { account: revisions },
  });

describe('成本策略生效时间边界', () => {
  it.each(['2030-01-31', '2030-01-31T00:00:00Z', '2030-01-31T00:00:00.000Z'])(
    '%s 与同日零点的初始策略时间相等',
    (occurredAt) => {
      expect(
        project(occurredAt, [strategy('initial', '2030-01-31T00:00:00.000Z')])[0]
          ?.costStrategyRevision?.id,
      ).toBe('initial');
    },
  );

  it('开仓之后的策略不能用于日期精度买入', () => {
    expect(() => project('2030-01-31', [strategy('future', '2030-01-31T00:00:00.001Z')])).toThrow(
      'Trade 开始时没有生效的成本策略',
    );
  });

  it('不同 UTC offset 的策略按真实时间排序并拒绝未来策略', () => {
    const revisions = [
      strategy('earlier', '2030-01-31T08:00:00+08:00'),
      strategy('latest', '2030-01-31T01:00:00Z'),
      strategy('future', '2030-01-30T23:30:00-03:00'),
    ];
    expect(project('2030-01-31T02:00:00Z', revisions)[0]?.costStrategyRevision?.id).toBe('latest');
  });
});
