import { describe, expect, it } from 'vitest';
import {
  strategyCrossDescriptionIssues,
  strategyCrossSummaryIssue,
} from '../src/strategy-cross-semantics.js';
import type { BooleanExpression, NumericExpression } from '../src/backtest-strategy.js';

const price: NumericExpression = { type: 'series', sourceId: 'price', field: 'close' };
const ema: NumericExpression = { type: 'indicator', name: 'EMA', input: price, params: { period: 20 } };
const cross = (direction: 'above' | 'below', swapped = false): BooleanExpression => ({
  type: 'cross', direction, left: swapped ? ema : price, right: swapped ? price : ema,
});
const description = '价格上穿均线时建立多头仓位，下穿均线或触发固定止损/最大持仓期限制时平仓。';

describe('生成策略的价格均线交叉语义', () => {
  it('复现腾讯候选：结构合法，但入场和退出都与说明相反', () => {
    expect(strategyCrossDescriptionIssues({ entry: cross('above', true), exit: cross('below', true), description }))
      .toEqual([expect.objectContaining({ path: 'entry' }), expect.objectContaining({ path: 'exit' })]);
  });

  it.each([false, true])('价格穿均线与交换左右后反转方向等价：%s', (swapped) => {
    const entry = cross(swapped ? 'below' : 'above', swapped);
    const exit = cross(swapped ? 'above' : 'below', swapped);
    expect(strategyCrossDescriptionIssues({ entry, exit, description })).toEqual([]);
    expect(strategyCrossSummaryIssue(entry, '当收盘价上穿EMA(20)时买入')).toBeUndefined();
    expect(strategyCrossSummaryIssue(exit, '价格下穿20日均线时卖出')).toBeUndefined();
  });

  it('逆势策略描述与定义一致时允许，不按名称推断方向', () => {
    expect(strategyCrossDescriptionIssues({ entry: cross('below'), exit: cross('above'),
      description: '价格下穿均线时买入，价格上穿均线时卖出。' })).toEqual([]);
  });

  it('确认摘要不能被模型说明掩盖；不改变输入', () => {
    const entry = cross('above', true);
    const before = structuredClone(entry);
    expect(strategyCrossSummaryIssue(entry, '价格上穿均线买入')).toContain('相反');
    expect(entry).toEqual(before);
  });

  it('单交叉与其他条件组合仍检查明确方向', () => {
    expect(strategyCrossSummaryIssue({ type: 'all', conditions: [cross('below'), { type: 'positionState', field: 'isOpen' }] },
      '价格上穿均线买入')).toContain('相反');
  });

  it('多交叉、否定、不同来源与均线穿价格不推断为单个价格交叉', () => {
    for (const expression of [
      { type: 'any', conditions: [cross('above'), cross('below')] },
      { type: 'not', expression: cross('below') },
      { type: 'cross', direction: 'below', left: price, right: { ...ema, input: { ...price, sourceId: 'other' } } },
    ] as BooleanExpression[]) {
      expect(strategyCrossSummaryIssue(expression, '价格上穿均线买入')).toBeUndefined();
    }
    for (const summary of ['禁止价格上穿均线买入', '短均线上穿长均线买入', '均线上穿价格买入', '趋势跟踪', '短均线上穿均线买入，下穿均线卖出'])
      expect(strategyCrossSummaryIssue(cross('below'), summary)).toBeUndefined();
  });
});
