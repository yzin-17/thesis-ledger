import { describe, expect, it } from 'vitest';
import {
  DecimalValue,
  projectTradeCostProjections,
  type LedgerEvent,
  type TradeCostMethod,
  type TradeProjection,
} from '../src/index.js';

type EffectiveEvent = Exclude<LedgerEvent, { revisionAction: 'VOID' }>;

const baseline = (
  id: string,
  quantity: string,
  occurredAt: string,
  revision: string,
  averageCost = '8',
): EffectiveEvent => ({
  version: 3,
  eventId: id,
  factId: id,
  accountId: 'controlled-account',
  ledgerRevision: revision,
  type: 'POSITION_BASELINE_OBSERVATION',
  occurredAt,
  timePrecision: occurredAt.length === 10 ? 'DATE' : 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: id,
  recordedAt: '2026-10-21T10:00:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'baseline-consistency-test' },
  actorId: 'test',
  revisionAction: 'CREATE',
  payload: {
    symbol: '600000.SH',
    batchId: `batch-${id}`,
    batchScope: 'PARTIAL',
    quantity,
    averageCost,
    currency: 'CNY',
    costIncludesFees: 'UNKNOWN',
  },
});

const execution = (
  type: 'BUY_EXECUTION' | 'SELL_EXECUTION',
  quantity: string,
  price: string,
  occurredAt: string,
  revision: string,
): EffectiveEvent => ({
  ...baseline(`execution-${revision}`, quantity, occurredAt, revision),
  type,
  payload: {
    symbol: '600000.SH',
    quantity,
    price,
    currency: 'CNY',
    capabilityVerification: 'UNVERIFIED',
    charges: [],
  },
});

const project = (events: readonly LedgerEvent[], method: TradeCostMethod) =>
  projectTradeCostProjections(events, {
    accountModeByAccountId: { 'controlled-account': 'shadow' },
    costStrategyRevisionsByAccountId: {
      'controlled-account': [
        {
          id: 'initial-strategy',
          method,
          effectiveAt: '2026-10-01T00:00:00.000Z',
          reason: '受控回归',
          actorId: 'test',
        },
      ],
    },
  });

const remainingCost = (trade: TradeProjection) =>
  [...trade.entryLegs, ...trade.baselineComponents].reduce(
    (total, source) => total.plus(source.remainingCost ?? '0'),
    DecimalValue.from('0'),
  );

describe.each<TradeCostMethod>(['AVG', 'FIFO'])('乱序余额观察一致性 %s', (method) => {
  it('晚录入旧观察后仍使用最新 3 份与成本 24，保留全部观察和冲突', () => {
    const events = [
      baseline('day-19', '3', '2026-10-19', '2'),
      baseline('day-21-first', '3', '2026-10-21T09:33:42.763Z', '3'),
      baseline('day-21-second', '3', '2026-10-21T09:41:36.447Z', '4'),
      baseline('day-20-late', '9', '2026-10-20', '6'),
    ];
    const before = structuredClone(events);
    const result = project(events, method);
    const trade = result[0]!;

    expect(result).toHaveLength(1);
    expect(trade).toMatchObject({
      lifecycle: 'ACTIVE',
      remainingQuantity: '3',
      sourceQuantity: '9',
      closedQuantity: '0',
      completeness: 'CONFLICTED',
      closeSlices: [],
    });
    expect(trade.issues).toContain('QUANTITY_CONFLICT');
    expect(trade.baselineComponents).toHaveLength(4);
    expect(trade.baselineComponents.map((source) => source.observedQuantity)).toEqual([
      '3',
      '9',
      '3',
      '3',
    ]);
    expect(remainingCost(trade).toString()).toBe('24');
    expect(remainingCost(trade).dividedBy(trade.remainingQuantity).toString()).toBe('8');
    expect(project([...events].reverse(), method)).toEqual(result);
    expect(events).toEqual(before);
  });

  it('部分收缩 Baseline 后继续处理真实卖出和买入，不推算额外成交', () => {
    const trade = project(
      [
        baseline('initial', '10', '2026-10-18', '1'),
        baseline('reduced', '6', '2026-10-19', '2', '9'),
        execution('SELL_EXECUTION', '2', '12', '2026-10-20', '3'),
        execution('BUY_EXECUTION', '2', '10', '2026-10-21', '4'),
      ],
      method,
    )[0]!;

    expect(trade.remainingQuantity).toBe('6');
    expect(remainingCost(trade).toString()).toBe('56');
    expect(trade.closedQuantity).toBe('2');
    expect(trade.closeSlices).toHaveLength(1);
    expect(trade.closeSlices[0]?.quantity).toBe('2');
    expect(trade.netRealizedPnl).toBe('6');
  });

  it('观察只收缩匿名差额，保留买入余量及其实际成本', () => {
    const trade = project(
      [
        baseline('initial', '3', '2026-10-18', '1'),
        execution('BUY_EXECUTION', '2', '10', '2026-10-19', '2'),
        baseline('reduced', '4', '2026-10-20', '3', '9'),
      ],
      method,
    )[0]!;

    expect(trade.remainingQuantity).toBe('4');
    expect(remainingCost(trade).toString()).toBe('36');
    expect(trade.entryLegs[0]).toMatchObject({ remainingQuantity: '2', remainingCost: '20' });
    expect(trade.closedQuantity).toBe('0');
    expect(trade.closeSlices).toEqual([]);
    expect(trade.issues).toContain('QUANTITY_CONFLICT');
  });

  it('小于已知真实买入量的观察继续保留原数量与成本冲突', () => {
    const trade = project(
      [
        execution('BUY_EXECUTION', '100', '8', '2026-10-18', '1'),
        baseline('conflicting', '80', '2026-10-19', '2'),
      ],
      method,
    )[0]!;

    expect(trade.remainingQuantity).toBe('100');
    expect(remainingCost(trade).toString()).toBe('800');
    expect(trade.completeness).toBe('CONFLICTED');
    expect(trade.issues).toEqual(['QUANTITY_CONFLICT']);
    expect(trade.closeSlices).toEqual([]);
  });

  it('零观察结束原周期并清空成本，之后观察开启独立周期', () => {
    const trades = project(
      [
        baseline('initial', '9', '2026-10-18', '1'),
        baseline('reduced', '3', '2026-10-19', '2'),
        baseline('zero', '0', '2026-10-20', '3'),
        baseline('next', '2', '2026-10-21', '4', '10'),
      ],
      method,
    );

    expect(trades.map((trade) => [trade.lifecycle, trade.remainingQuantity])).toEqual([
      ['ENDED', '0'],
      ['ACTIVE', '2'],
    ]);
    expect(trades.map((trade) => remainingCost(trade).toString())).toEqual(['0', '20']);
    expect(trades[0]?.closeSlices).toEqual([]);
    expect(trades[0]?.closedQuantity).toBe('0');
  });

  it('已收缩的匿名差额不能继续供超额卖出使用', () => {
    expect(() =>
      project(
        [
          baseline('initial', '9', '2026-10-18', '1'),
          baseline('reduced', '3', '2026-10-19', '2'),
          execution('SELL_EXECUTION', '4', '10', '2026-10-20', '3'),
        ],
        method,
      ),
    ).toThrow('卖出数量超过持仓');
  });

  it('更正与作废最新观察后按有效事实重放，输入顺序不改变结果', () => {
    const initial = baseline('initial', '9', '2026-10-18', '1');
    const observation = baseline('latest', '3', '2026-10-20', '2');
    const replacement: LedgerEvent = {
      ...baseline('corrected', '6', '2026-10-20', '3'),
      factId: observation.factId,
      revisionAction: 'REPLACE',
      supersedesEventId: observation.eventId,
      reason: '更正观察数量',
    };
    const voided: LedgerEvent = {
      ...replacement,
      eventId: 'voided',
      ledgerRevision: '4',
      revisionAction: 'VOID',
      supersedesEventId: replacement.eventId,
      reason: '作废错误观察',
    };
    const corrected = project([initial, observation, replacement], method)[0]!;
    expect(corrected.remainingQuantity).toBe('6');
    expect(remainingCost(corrected).toString()).toBe('48');
    const result = project([voided, initial, replacement, observation], method)[0]!;
    expect(result.remainingQuantity).toBe('9');
    expect(remainingCost(result).toString()).toBe('72');
    expect(result.issues).not.toContain('QUANTITY_CONFLICT');
  });
});
