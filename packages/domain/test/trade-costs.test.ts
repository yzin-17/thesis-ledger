import { describe, expect, it } from 'vitest';
import type { ExecutionChargeV2, LedgerEventTypeV2, LedgerEventV2 } from '../src/index.js';
import { DecimalValue } from '../src/decimal.js';
import {
  projectTradeCostProjections,
  type TradeCostMethod,
  type TradeCostStrategyRevision,
} from '../src/index.js';

type PayloadEvent = Exclude<LedgerEventV2, { revisionAction: 'VOID' }>;

let sequence = 0;

const event = (
  type: LedgerEventTypeV2,
  payload: unknown,
  overrides: Partial<
    Pick<PayloadEvent, 'accountId' | 'eventId' | 'factId' | 'ledgerRevision' | 'occurredAt'>
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
    economicOrderKey: id,
    recordedAt: '2026-08-27T00:00:00.000Z',
    payloadVersion: 1,
    source: { category: 'MANUAL' as const, channel: 'domain-cost-test' },
    actorId: 'test-user',
    revisionAction: 'CREATE' as const,
    payload,
  } as PayloadEvent;
};

const charge = (
  category: ExecutionChargeV2['category'],
  amount: string,
  currency: string,
): ExecutionChargeV2 => ({ category, amount, currency });

const execution = (
  type: 'BUY_EXECUTION' | 'SELL_EXECUTION',
  id: string,
  quantity: string,
  price: string,
  occurredAt: string,
  charges: ExecutionChargeV2[] = [],
) =>
  event(
    type,
    {
      symbol: 'AAPL.US',
      quantity,
      price,
      currency: 'USD',
      capabilityVerification: 'VERIFIED',
      charges,
    },
    { eventId: id, factId: id, occurredAt },
  );

const baseline = (
  id: string,
  quantity: string,
  occurredAt: string,
  averageCost?: string,
  costIncludesFees: 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN' = 'UNKNOWN',
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
      costIncludesFees,
    },
    { eventId: id, factId: id, occurredAt },
  );

const strategy = (
  method: TradeCostMethod,
  effectiveAt = '2025-12-31',
): TradeCostStrategyRevision => ({
  id: `strategy-${method.toLowerCase()}-${effectiveAt}`,
  method,
  effectiveAt,
  reason: 'domain test',
  actorId: 'test-user',
});

const projectCosts = (
  events: readonly LedgerEventV2[],
  revisions: readonly TradeCostStrategyRevision[],
) =>
  projectTradeCostProjections(events, {
    accountModeByAccountId: { 'account-actual': 'actual' },
    costStrategyRevisionsByAccountId: { 'account-actual': revisions },
  });

const add = (values: readonly (string | DecimalValue)[]) =>
  values.reduce((total, value) => total.plus(value), DecimalValue.from('0'));

describe('Trade Cost Projection 成本与收益守恒', () => {
  it('移动加权平均和 FIFO 使用不同的来源分配，但都严格扣除费用', () => {
    const events = [
      execution('BUY_EXECUTION', 'buy-1', '100', '10', '2026-01-01', [
        charge('COMMISSION', '2', 'USD'),
      ]),
      execution('BUY_EXECUTION', 'buy-2', '50', '20', '2026-01-02', [
        charge('COMMISSION', '3', 'USD'),
      ]),
      execution('SELL_EXECUTION', 'sell-1', '75', '30', '2026-01-03', [charge('TAX', '4', 'USD')]),
    ];

    const average = projectCosts(events, [strategy('AVG')])[0]!;
    const fifo = projectCosts(events, [strategy('FIFO')])[0]!;

    expect(average.costStrategyRevision?.method).toBe('AVG');
    expect(average.closeSlices[0]?.allocations).toMatchObject([
      { sourceFactId: 'buy-1', quantity: '50', originalCost: '500' },
      { sourceFactId: 'buy-2', quantity: '25', originalCost: '500' },
    ]);
    expect(average.closeSlices[0]).toMatchObject({
      grossRealizedPnl: '1250',
      netRealizedPnl: '1243.5',
    });
    const averageReturnRate = DecimalValue.from('1243.5').dividedBy('1002.5').toString();
    expect(average.closeSlices[0]?.realizedNetReturnRate).toBe(averageReturnRate);
    expect(average.realizedNetReturnRate).toBe(averageReturnRate);

    expect(fifo.costStrategyRevision?.method).toBe('FIFO');
    expect(fifo.closeSlices[0]?.allocations).toMatchObject([
      { sourceFactId: 'buy-1', quantity: '75', originalCost: '750' },
    ]);
    expect(fifo.closeSlices[0]).toMatchObject({
      grossRealizedPnl: '1500',
      netRealizedPnl: '1494.5',
    });
    const fifoReturnRate = DecimalValue.from('1494.5').dividedBy('751.5').toString();
    expect(fifo.closeSlices[0]?.realizedNetReturnRate).toBe(fifoReturnRate);
    expect(fifo.realizedNetReturnRate).toBe(fifoReturnRate);
    expect(fifo.entryLegs[0]?.remainingQuantity).toBe('25');
    expect(fifo.entryLegs[1]?.remainingQuantity).toBe('50');
  });

  it('成本策略在 Trade 开仓时固定，后续 Revision 不切换既有周期', () => {
    const trades = projectCosts(
      [
        execution('BUY_EXECUTION', 'buy-1', '10', '10', '2026-01-01'),
        execution('SELL_EXECUTION', 'sell-1', '10', '11', '2026-01-02'),
        execution('BUY_EXECUTION', 'buy-2', '10', '20', '2026-01-03'),
        execution('SELL_EXECUTION', 'sell-2', '10', '21', '2026-01-04'),
      ],
      [strategy('AVG', '2025-12-31'), strategy('FIFO', '2026-01-03')],
    );

    expect(trades.map((trade) => trade.costStrategyRevision?.method)).toEqual(['AVG', 'FIFO']);
  });

  it('公司行动只改变可消耗数量，不增加来源总成本', () => {
    const trade = projectCosts(
      [
        execution('BUY_EXECUTION', 'buy-1', '100', '10', '2026-01-01'),
        event(
          'SPLIT',
          { symbol: 'AAPL.US', fromUnits: '1', toUnits: '2' },
          { eventId: 'split-1', factId: 'split-1', occurredAt: '2026-01-02' },
        ),
        execution('SELL_EXECUTION', 'sell-1', '200', '6', '2026-01-03'),
      ],
      [strategy('FIFO')],
    )[0]!;

    expect(trade.entryLegs[0]).toMatchObject({
      quantity: '200',
      rawCost: '1000',
      remainingQuantity: '0',
    });
    expect(trade.closeSlices[0]?.allocations).toMatchObject([
      { quantity: '200', originalCost: '1000' },
    ]);
    expect(trade.closeSlices[0]?.grossRealizedPnl).toBe('200');
  });

  it('基线成本结果保留估算标记，不冒充完整成交成本', () => {
    const knownAverageCost = projectCosts(
      [
        baseline('baseline-1', '100', '2026-01-01', '10'),
        execution('SELL_EXECUTION', 'sell-1', '50', '12', '2026-01-02'),
      ],
      [strategy('FIFO')],
    )[0]!;

    expect(knownAverageCost).toMatchObject({
      completeness: 'PARTIAL',
      costEstimated: true,
      grossRealizedPnl: '100',
      netRealizedPnl: '100',
      costIssues: ['BASELINE_COST_SCOPE_UNKNOWN'],
    });
    expect(knownAverageCost.closeSlices[0]?.allocations[0]).toMatchObject({
      quantity: '50',
      originalCost: '500',
    });

    const unknownCost = projectCosts(
      [
        baseline('baseline-unknown', '100', '2026-01-01'),
        execution('SELL_EXECUTION', 'sell-unknown', '50', '12', '2026-01-02'),
      ],
      [strategy('FIFO')],
    )[0]!;
    expect(unknownCost).toMatchObject({
      costEstimated: true,
      grossRealizedPnl: null,
      netRealizedPnl: null,
      costIssues: ['BASELINE_COST_SCOPE_UNKNOWN', 'BASELINE_COST_UNKNOWN'],
    });
  });

  it('后续 Baseline 作为检查点重估未解释成本，并保留已消费成本', () => {
    const checkpoint = projectCosts(
      [
        baseline('baseline-1', '1000', '2026-01-01', '0.75'),
        baseline('baseline-2', '1500', '2026-01-02', '0.932'),
      ],
      [strategy('AVG')],
    )[0]!;

    expect(checkpoint).toMatchObject({ remainingQuantity: '1500' });
    expect(checkpoint.baselineComponents.map((component) => component.quantity)).toEqual([
      '1000',
      '500',
    ]);
    expect(
      add(
        checkpoint.baselineComponents.map((component) => component.remainingCost ?? '0'),
      ).toString(),
    ).toBe('1398');

    const afterSell = projectCosts(
      [
        baseline('baseline-sold-1', '100', '2026-01-01', '10'),
        execution('SELL_EXECUTION', 'sell-1', '40', '12', '2026-01-02'),
        baseline('baseline-sold-2', '100', '2026-01-03', '11'),
      ],
      [strategy('FIFO')],
    )[0]!;

    expect(afterSell.baselineComponents).toMatchObject([
      { remainingQuantity: '60', rawCost: '1060', remainingCost: '660' },
      { remainingQuantity: '40', rawCost: '440', remainingCost: '440' },
    ]);
    expect(afterSell.closeSlices[0]?.allocations[0]).toMatchObject({ originalCost: '400' });
  });

  it('不同币种费用只保留明细，不折算后混入原币净收益', () => {
    const trade = projectCosts(
      [
        execution('BUY_EXECUTION', 'buy-1', '100', '10', '2026-01-01', [
          charge('COMMISSION', '2', 'USD'),
          charge('LEVY', '5', 'HKD'),
        ]),
        execution('SELL_EXECUTION', 'sell-1', '100', '12', '2026-01-02', [
          charge('TAX', '3', 'USD'),
          charge('LEVY', '4', 'HKD'),
        ]),
      ],
      [strategy('FIFO')],
    )[0]!;

    expect(trade.grossRealizedPnl).toBe('200');
    expect(trade.netRealizedPnl).toBeNull();
    expect(trade.costIssues).toEqual(['FEE_CURRENCY_MISMATCH']);
    expect(trade.entryLegs[0]?.charges).toEqual([
      { category: 'COMMISSION', amount: '2', currency: 'USD' },
      { category: 'LEVY', amount: '5', currency: 'HKD' },
    ]);
    expect(trade.closeSlices[0]?.charges).toEqual([
      { category: 'TAX', amount: '3', currency: 'USD' },
      { category: 'LEVY', amount: '4', currency: 'HKD' },
    ]);
  });

  it('对生成的合法事件序列验证数量、原始成本和买入费用守恒', () => {
    for (const method of ['AVG', 'FIFO'] as const) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let randomState = seed;
        const nextRandom = () => {
          randomState = (randomState * 48271) % 2147483647;
          return randomState;
        };
        const buyQuantities = [1, 2, 3].map(() => 1 + (nextRandom() % 5));
        const totalQuantity = buyQuantities.reduce((total, quantity) => total + quantity, 0);
        const firstSellQuantity =
          totalQuantity === 1 ? 1 : 1 + (nextRandom() % (totalQuantity - 1));
        const secondSellQuantity = totalQuantity - firstSellQuantity;
        const buyEvents = buyQuantities.map((quantity, index) =>
          execution(
            'BUY_EXECUTION',
            `${method.toLowerCase()}-generated-buy-${seed}-${index}`,
            String(quantity),
            String(10 + (nextRandom() % 21)),
            `2026-02-0${index + 1}`,
            [charge('COMMISSION', String(1 + (nextRandom() % 3)), 'USD')],
          ),
        );
        const events = [
          ...buyEvents,
          execution(
            'SELL_EXECUTION',
            `${method.toLowerCase()}-generated-sell-${seed}-1`,
            String(firstSellQuantity),
            '40',
            '2026-02-04',
            [charge('TAX', '1', 'USD')],
          ),
          ...(secondSellQuantity === 0
            ? []
            : [
                execution(
                  'SELL_EXECUTION',
                  `${method.toLowerCase()}-generated-sell-${seed}-2`,
                  String(secondSellQuantity),
                  '40',
                  '2026-02-05',
                  [charge('TAX', '2', 'USD')],
                ),
              ]),
        ];
        const trade = projectCosts(events, [strategy(method)])[0]!;
        const allocated = trade.closeSlices.flatMap((slice) => slice.allocations);
        const entryCost = add(trade.entryLegs.map((entryLeg) => entryLeg.rawCost ?? '0'));
        const allocatedCost = add(allocated.map((allocation) => allocation.originalCost ?? '0'));
        const entryFees = add(
          trade.entryLegs.flatMap((entryLeg) =>
            (entryLeg.charges ?? []).map((item) => item.amount),
          ),
        );
        const allocatedFees = add(
          allocated.flatMap((allocation) =>
            (allocation.allocatedBuyCharges ?? []).map((item) => item.amount),
          ),
        );

        expect(add(allocated.map((allocation) => allocation.quantity)).toString()).toBe(
          String(totalQuantity),
        );
        expect(allocatedCost.toString()).toBe(entryCost.toString());
        expect(allocatedFees.toString()).toBe(entryFees.toString());
        expect(trade.remainingQuantity).toBe('0');
        expect(trade.netRealizedPnl).not.toBeNull();
      }
    }
  });

  it.each<TradeCostMethod>(['AVG', 'FIFO'])('%s 的部分平仓满足数量和成本守恒', (method) => {
    const trade = projectCosts(
      [
        execution('BUY_EXECUTION', 'buy-1', '1', '10', '2026-01-01'),
        execution('BUY_EXECUTION', 'buy-2', '2', '20', '2026-01-02'),
        execution('BUY_EXECUTION', 'buy-3', '3', '30', '2026-01-03'),
        execution('SELL_EXECUTION', 'sell-1', '1', '40', '2026-01-04'),
        execution('SELL_EXECUTION', 'sell-2', '2', '40', '2026-01-05'),
        execution('SELL_EXECUTION', 'sell-3', '3', '40', '2026-01-06'),
      ],
      [strategy(method)],
    )[0]!;
    const allocations = trade.closeSlices.flatMap((slice) => slice.allocations);

    expect(add(trade.closeSlices.map((slice) => slice.quantity)).toString()).toBe('6');
    expect(add(allocations.map((allocation) => allocation.quantity)).toString()).toBe('6');
    expect(add(allocations.map((allocation) => allocation.originalCost ?? '0')).toString()).toBe(
      '140',
    );
    expect(trade.remainingQuantity).toBe('0');
    expect(trade.grossRealizedPnl).toBe('100');
  });

  it('移动平均最后一个来源承接 40 位小数舍入尾差', () => {
    const trade = projectCosts(
      [
        execution('BUY_EXECUTION', 'buy-1', '1', '10', '2026-01-01'),
        execution('BUY_EXECUTION', 'buy-2', '1', '10', '2026-01-02'),
        execution('BUY_EXECUTION', 'buy-3', '1', '10', '2026-01-03'),
        execution('SELL_EXECUTION', 'sell-1', '1', '20', '2026-01-04'),
      ],
      [strategy('AVG')],
    )[0]!;
    const quantities = trade.closeSlices[0]!.allocations.map((allocation) => allocation.quantity);

    expect(quantities).toEqual([
      '0.3333333333333333333333333333333333333333',
      '0.3333333333333333333333333333333333333333',
      '0.3333333333333333333333333333333333333334',
    ]);
    expect(add(quantities).toString()).toBe('1');
  });
});
