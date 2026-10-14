import { describe, expect, it } from 'vitest';
import { calculateExecutionModelFees, resolveExecutionModelSegment } from '@thesis-ledger/domain';
import type { FrozenExecutionModel } from '@thesis-ledger/domain';
import { publicFeeInputs } from './public-fees-fixtures.js';
import { combinePublicFeesExecutionModelV3 } from '../../src/backtest/backtest-public-fees-model-v3.js';

describe('公共费率与原执行模型组合', () => {
  it('组合后的研究配置继续执行原历史规则的可知时钟限制', async () => {
    const { model, fees } = await publicFeeInputs();
    const original = model.segments[0]!;
    original.source = {
      kind: 'historicalFact',
      knownAt: '2023-08-28T08:00:00Z',
      description: original.source.description,
      references: original.source.references,
      revision: original.source.revision,
    };
    const combined = combinePublicFeesExecutionModelV3(model, fees);
    expect(() =>
      resolveExecutionModelSegment(combined as unknown as FrozenExecutionModel, {
        expectedVersion: combined.version,
        symbol: fees.symbol,
        market: 'CN',
        instrumentType: 'STOCK',
        currency: 'CNY',
        evaluatedAt: '2023-08-25T02:00:00Z',
        dataAsOf: '2026-10-06T00:00:00Z',
      }),
    ).toThrow('尚不可知');
  });
  it('08-28 按成交本地日期切换，保留佣金最低额与含规费处理', async () => {
    const { model, fees } = await publicFeeInputs();
    const original = structuredClone(model);
    const combined = combinePublicFeesExecutionModelV3(model, fees);
    const amountAt = (date: string) => {
      const segment = resolveExecutionModelSegment(combined as unknown as FrozenExecutionModel, {
        expectedVersion: combined.version,
        symbol: '600000.SH',
        market: 'CN',
        instrumentType: 'STOCK',
        currency: 'CNY',
        evaluatedAt: `${date}T02:00:00Z`,
        dataAsOf: '2026-10-06T00:00:00Z',
      });
      if (!segment.fees) throw new Error('缺少费用');
      return calculateExecutionModelFees(segment.fees, {
        side: 'sell',
        turnover: '10000',
        currency: 'CNY',
      }).charges;
    };
    expect(amountAt('2023-08-25').find((item) => item.code === 'stampDuty')?.amount).toBe('10');
    expect(amountAt('2023-08-28').find((item) => item.code === 'stampDuty')?.amount).toBe('5');
    expect(amountAt('2023-08-28').find((item) => item.code === 'commission')?.amount).toBe('5');
    expect(amountAt('2023-08-28').find((item) => item.code === 'handlingFee')).toBeUndefined();
    expect(combined.segments.map((item) => item.range)).toEqual([
      { start: '2023-08-25', end: '2023-08-27' },
      { start: '2023-08-28', end: '2023-08-29' },
    ]);
    expect(combined.segments.every((item) => item.source.kind === 'userConfiguration')).toBe(true);
    expect(model).toEqual(original);
  });

  it('保留原模型分段，单独计费的经手费应用实际变化和原取整', async () => {
    const { model, fees } = await publicFeeInputs();
    const segment = model.segments[0]!;
    if (!segment.fees) throw new Error('缺少费用');
    segment.fees.handlingFee = { ...segment.fees.commission, rate: '0', minimum: { kind: 'none' } };
    model.segments = [
      { ...segment, id: 'first', range: { start: '2023-08-25', end: '2023-08-28' } },
      { ...segment, id: 'second', range: { start: '2023-08-29', end: '2023-08-29' } },
    ];
    const combined = combinePublicFeesExecutionModelV3(model, fees);
    expect(combined.segments).toHaveLength(3);
    const amounts = combined.segments.map(
      (part) =>
        part.fees &&
        calculateExecutionModelFees(part.fees, {
          side: 'sell',
          turnover: '10000',
          currency: 'CNY',
        }).charges.find((fee) => fee.code === 'handlingFee')?.amount,
    );
    expect(amounts).toEqual(['0.49', '0.34', '0.34']);
  });

  it('拒绝缺口、重复费项和缺少金额设置，供创建方显式使用模型兜底', async () => {
    const { model, fees } = await publicFeeInputs();
    const gap = structuredClone(fees);
    gap.segments[1]!.range.start = '2023-08-29';
    expect(() => combinePublicFeesExecutionModelV3(model, gap)).toThrow('缺口');
    const duplicate = structuredClone(fees);
    duplicate.segments[0]!.charges[0] = duplicate.segments[0]!.charges[1]!;
    expect(() => combinePublicFeesExecutionModelV3(model, duplicate)).toThrow('完整费项');
    const missing = structuredClone(model);
    if (!missing.segments[0]!.fees) throw new Error('缺少费用');
    missing.segments[0]!.fees.transferFee = {
      treatment: 'notApplicable',
      reason: '原研究模型省略',
    };
    expect(() => combinePublicFeesExecutionModelV3(missing, fees)).toThrow('金额计算设置');
  });
});
