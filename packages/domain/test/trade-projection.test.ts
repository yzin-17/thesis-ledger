import { describe, expect, it } from 'vitest';
import {
  projectTradeProjections,
  type LedgerEventTypeV2,
  type LedgerEventV2,
} from '../src/index.js';

type PayloadEvent = Exclude<LedgerEventV2, { revisionAction: 'VOID' }>;

let sequence = 0;

const event = (
  type: LedgerEventTypeV2,
  payload: unknown,
  overrides: Partial<
    Pick<
      PayloadEvent,
      'accountId' | 'eventId' | 'factId' | 'ledgerRevision' | 'occurredAt' | 'economicOrderKey'
    >
  > = {},
) => {
  const id = overrides.eventId ?? `${type.toLowerCase()}-${sequence + 1}`;
  sequence += 1;
  return {
    version: 2,
    eventId: id,
    factId: overrides.factId ?? id,
    accountId: overrides.accountId ?? 'account-actual',
    ledgerRevision: overrides.ledgerRevision ?? String(sequence),
    type,
    occurredAt:
      overrides.occurredAt === undefined
        ? `2026-01-${String(sequence).padStart(2, '0')}`
        : overrides.occurredAt,
    timePrecision: 'DATE' as const,
    sourceTimezone: 'UTC',
    economicOrderKey: overrides.economicOrderKey ?? id,
    recordedAt: '2026-08-27T00:00:00.000Z',
    payloadVersion: 1,
    source: { category: 'MANUAL' as const, channel: 'domain-test' },
    actorId: 'test-user',
    revisionAction: 'CREATE' as const,
    payload,
  } as PayloadEvent;
};

const buy = (id: string, quantity: string, occurredAt: string, accountId = 'account-actual') =>
  event(
    'BUY_EXECUTION',
    {
      symbol: 'AAPL.US',
      quantity,
      price: '10',
      currency: 'USD',
      capabilityVerification: 'VERIFIED',
      charges: [],
    },
    { eventId: id, factId: id, accountId, occurredAt, economicOrderKey: id },
  );

const sell = (id: string, quantity: string, occurredAt: string, accountId = 'account-actual') =>
  event(
    'SELL_EXECUTION',
    {
      symbol: 'AAPL.US',
      quantity,
      price: '12',
      currency: 'USD',
      capabilityVerification: 'VERIFIED',
      charges: [],
    },
    { eventId: id, factId: id, accountId, occurredAt, economicOrderKey: id },
  );

const baseline = (
  id: string,
  quantity: string,
  occurredAt: string,
  averageCost?: string,
  accountId = 'account-actual',
) =>
  event(
    'POSITION_BASELINE_OBSERVATION',
    {
      symbol: 'AAPL.US',
      batchId: `batch-${id}`,
      batchScope: 'FULL',
      quantity,
      ...(averageCost === undefined ? {} : { averageCost }),
      currency: 'USD',
      costIncludesFees: 'UNKNOWN',
    },
    { eventId: id, factId: id, accountId, occurredAt, economicOrderKey: id },
  );

const projection = (
  events: readonly LedgerEventV2[],
  accountModeByAccountId: Record<string, 'actual' | 'shadow'> = { 'account-actual': 'actual' },
) => projectTradeProjections(events, { accountModeByAccountId });

describe('Trade Projection 领域引擎', () => {
  it('把分批建仓、部分平仓和再次加仓保留在同一 Trade', () => {
    const result = projection([
      buy('buy-1', '100', '2026-01-01'),
      buy('buy-2', '50', '2026-01-02'),
      sell('sell-1', '80', '2026-01-03'),
      buy('buy-3', '20', '2026-01-04'),
      sell('sell-2', '90', '2026-01-05'),
    ]);
    const trade = result[0]!;

    expect(result).toHaveLength(1);
    expect(trade).toMatchObject({
      id: 'trade:trade-projection-v1:account-actual:AAPL.US:buy-1',
      lifecycle: 'ENDED',
      exitProgress: 'FULL',
      endEvidence: 'SELL_EXECUTION',
      openedAt: '2026-01-01',
      closedAt: '2026-01-05',
      closedQuantity: '170',
      remainingQuantity: '0',
      completeness: 'COMPLETE',
      issues: [],
    });
    expect(trade.entryLegs).toHaveLength(3);
    expect(trade.closeSlices.map((slice) => slice.quantity)).toEqual(['80', '90']);
    expect(
      trade.closeSlices.flatMap((slice) => slice.allocations.map((item) => item.quantity)),
    ).toEqual(['80', '20', '50', '20']);
  });

  it('完全平仓后重新买入会创建新的交易周期', () => {
    const result = projection([
      buy('buy-1', '50', '2026-01-01'),
      sell('sell-1', '50', '2026-01-02'),
      buy('buy-2', '10', '2026-01-03'),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((trade) => [trade.id, trade.lifecycle, trade.remainingQuantity])).toEqual([
      ['trade:trade-projection-v1:account-actual:AAPL.US:buy-1', 'ENDED', '0'],
      ['trade:trade-projection-v1:account-actual:AAPL.US:buy-2', 'ACTIVE', '10'],
    ]);
  });

  it('余额观察为零时结束 Trade，但不伪造 SELL 或 Close Slice', () => {
    const result = projection([
      buy('buy-1', '100', '2026-01-01'),
      baseline('baseline-zero', '0', '2026-01-02'),
    ]);
    const trade = result[0]!;

    expect(trade).toMatchObject({
      lifecycle: 'ENDED',
      exitProgress: 'NONE',
      endEvidence: 'BALANCE_OBSERVATION',
      closedAt: null,
      closedQuantity: '0',
      remainingQuantity: '0',
      completeness: 'PARTIAL',
    });
    expect(trade.closeSlices).toEqual([]);
    expect(trade.issues).toContain('UNKNOWN_CLOSURE');
  });

  it('公司行动只调整来源数量并保留同一 Trade', () => {
    const result = projection([
      buy('buy-1', '100', '2026-01-01'),
      event(
        'BONUS_SHARE',
        { symbol: 'AAPL.US', quantity: '10' },
        {
          eventId: 'bonus-1',
          factId: 'bonus-1',
          occurredAt: '2026-01-02',
          economicOrderKey: 'bonus-1',
        },
      ),
      event(
        'SPLIT',
        { symbol: 'AAPL.US', fromUnits: '1', toUnits: '2' },
        {
          eventId: 'split-1',
          factId: 'split-1',
          occurredAt: '2026-01-03',
          economicOrderKey: 'split-1',
        },
      ),
      event(
        'MERGE',
        { symbol: 'AAPL.US', fromUnits: '2', toUnits: '1' },
        {
          eventId: 'merge-1',
          factId: 'merge-1',
          occurredAt: '2026-01-04',
          economicOrderKey: 'merge-1',
        },
      ),
      sell('sell-1', '110', '2026-01-05'),
    ]);
    const trade = result[0]!;

    expect(trade.remainingQuantity).toBe('0');
    expect(trade.corporateActionAdjustments.map((action) => action.positionQuantityAfter)).toEqual([
      '110',
      '220',
      '110',
    ]);
    expect(trade.entryLegs[0]).toMatchObject({
      originalQuantity: '100',
      quantity: '110',
      remainingQuantity: '0',
    });
    expect(trade.closeSlices[0]?.allocations).toEqual([
      { source: 'ENTRY_LEG', sourceEventId: 'buy-1', sourceFactId: 'buy-1', quantity: '110' },
    ]);
  });

  it('把分红作为独立归属，不与价差 Close Slice 合并', () => {
    const result = projection([
      buy('buy-1', '100', '2026-01-01'),
      event(
        'DIVIDEND',
        { symbol: 'AAPL.US', amount: '5.25', currency: 'USD' },
        {
          eventId: 'dividend-1',
          factId: 'dividend-1',
          occurredAt: '2026-01-02',
          economicOrderKey: 'dividend-1',
        },
      ),
      sell('sell-1', '100', '2026-01-03'),
    ]);
    const trade = result[0]!;

    expect(trade.dividendAttributions).toEqual([
      {
        eventId: 'dividend-1',
        factId: 'dividend-1',
        occurredAt: '2026-01-02',
        amount: '5.25',
        currency: 'USD',
      },
    ]);
    expect(trade.closeSlices).toHaveLength(1);
    expect(trade.evidenceSources.map((source) => source.kind)).toEqual([
      'EXECUTION',
      'DIVIDEND',
      'EXECUTION',
    ]);
  });

  it('为基线建立独立 Component，已知成交只解释差额且不重复计入', () => {
    const events = [
      buy('buy-before-baseline', '50', '2026-01-01'),
      baseline('baseline-1', '100', '2026-01-02', '10'),
      event(
        'BASELINE_RECONCILIATION',
        {
          symbol: 'AAPL.US',
          baselineFactId: 'baseline-1',
          executionFactIds: ['buy-before-baseline'],
          coveredQuantity: '50',
          coveredCost: '500',
          ruleVersion: 1,
        },
        {
          eventId: 'reconciliation-1',
          factId: 'reconciliation-1',
          occurredAt: '2026-01-02',
          economicOrderKey: 'reconciliation:baseline-1',
        },
      ),
      sell('sell-1', '30', '2026-01-03'),
    ];
    const trade = projection(events)[0]!;

    expect(trade).toMatchObject({
      openedAt: null,
      remainingQuantity: '70',
      closedQuantity: '30',
      completeness: 'PARTIAL',
    });
    expect(trade.baselineComponents[0]).toMatchObject({
      observedQuantity: '100',
      quantity: '50',
      remainingQuantity: '50',
      reconciledExecutionFactIds: ['buy-before-baseline'],
      reconciliationFactIds: ['reconciliation-1'],
    });
    expect(trade.entryLegs[0]?.remainingQuantity).toBe('20');
    expect(trade.evidenceSources.map((source) => source.kind)).toContain('BASELINE_RECONCILIATION');
  });

  it('基线数量小于已知持仓时保留数量冲突，不静默减少持仓', () => {
    const trade = projection([
      buy('buy-1', '100', '2026-01-01'),
      baseline('baseline-conflict', '80', '2026-01-02', '10'),
    ])[0]!;

    expect(trade).toMatchObject({
      lifecycle: 'ACTIVE',
      remainingQuantity: '100',
      completeness: 'CONFLICTED',
    });
    expect(trade.issues).toEqual(['QUANTITY_CONFLICT']);
  });

  it('实际账户和影子账户按账户模式分别投影', () => {
    const result = projection(
      [
        buy('actual-buy', '10', '2026-01-01', 'account-actual'),
        buy('shadow-buy', '20', '2026-01-01', 'account-shadow'),
      ],
      { 'account-actual': 'actual', 'account-shadow': 'shadow' },
    );

    expect(
      result.map((trade) => [trade.accountId, trade.accountMode, trade.remainingQuantity]),
    ).toEqual([
      ['account-actual', 'actual', '10'],
      ['account-shadow', 'shadow', '20'],
    ]);
  });

  it('没有账户模式映射时拒绝生成可能混合事实性质的投影', () => {
    expect(() =>
      projectTradeProjections([buy('buy-1', '10', '2026-01-01')], {
        accountModeByAccountId: {},
      }),
    ).toThrow('缺少账户模式');
  });

  it('相同事实乱序输入仍得到相同投影，并按事实版本排除 VOID', () => {
    const original = {
      ...buy('buy-1', '10', '2026-01-01'),
      ledgerRevision: '1',
    };
    const replacement = {
      ...original,
      eventId: 'buy-1-replacement',
      ledgerRevision: '2',
      revisionAction: 'REPLACE' as const,
      supersedesEventId: 'buy-1',
      reason: '更正数量',
      payload: { ...original.payload, quantity: '12' },
    } as LedgerEventV2;
    const voidSell = {
      ...sell('sell-1', '12', '2026-01-02'),
      ledgerRevision: '3',
    };
    const voidRevision = {
      ...voidSell,
      eventId: 'sell-1-void',
      ledgerRevision: '4',
      revisionAction: 'VOID' as const,
      supersedesEventId: 'sell-1',
      reason: '撤销错误卖出',
    } as LedgerEventV2;
    const ordered = projection([original, replacement, voidSell, voidRevision]);
    const shuffled = projection([voidRevision, voidSell, replacement, original]);

    expect(shuffled).toEqual(ordered);
    expect(ordered[0]).toMatchObject({ lifecycle: 'ACTIVE', remainingQuantity: '12' });
  });

  it('拒绝非法超额卖出', () => {
    expect(() => projection([sell('sell-1', '1', '2026-01-01')])).toThrow('卖出数量超过持仓');
  });
});
