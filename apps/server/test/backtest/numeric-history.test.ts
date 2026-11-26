import { describe, expect, it } from 'vitest';
import {
  evaluateBooleanExpression,
  evaluateNumericExpression,
  numericExpressionKey,
  strategyRequiredLookback,
  type NumericExpression,
  type BooleanExpression,
} from '@thesis-ledger/domain';
import { strategySchema, priceResearchStrategySummary } from '@thesis-ledger/schemas';
import {
  at,
  series,
  constant,
  highest,
  priorHighest,
  breakout,
  definition,
  inputPoints,
  context,
} from './numeric-expression.fixtures.js';

describe('数值运算与按来源观测的历史引用', () => {
  it.each([
    ['105', true],
    ['100', false],
  ] as const)('R11 排除当根最高 110，收盘 %s 的结果为 %s', (close, value) => {
    const strategy = definition(breakout);
    const points = inputPoints(21);
    points[20] = { ...points[20]!, value: '110', high: '110' };
    expect(strategyRequiredLookback(strategy).entry).toBe(21);
    const evaluation = context(strategy.entry as BooleanExpression, points, close);
    expect(evaluateNumericExpression(priorHighest, evaluation)).toMatchObject({
      status: 'available',
      value: '100',
    });
    expect(evaluateBooleanExpression(breakout, evaluation)).toMatchObject({
      status: 'available',
      value,
    });
    expect(priceResearchStrategySummary(strategy).entry).toContain('排除当前 1 根');
  });

  it('此前只有 19 根时不可用，不以含当根 20 根冒充完整历史窗口', () => {
    expect(evaluateBooleanExpression(breakout, context(breakout, inputPoints(20))).status).toBe(
      'unavailable',
    );
  });

  it('按来源观测移动，不把相隔两天的样本视为缺少一个历史自然日', () => {
    const lag: NumericExpression = { type: 'lag', periods: 1, input: series('high') };
    const points = inputPoints(2);
    points[0] = { ...points[0]!, value: '97' };
    expect(evaluateNumericExpression(lag, context(lag, points))).toMatchObject({
      status: 'available',
      value: '97',
    });
  });

  it('后续历史窗口缺值时不可用，不回退曾经有效的最高价', () => {
    const points = inputPoints(25);
    points[22] = { occurredAt: at(22), availableAt: at(22), status: 'unavailable' };
    const evaluation = context(breakout, points);
    expect(
      evaluation.indicatorSeries.get(numericExpressionKey(priorHighest))?.points.at(-1)?.status,
    ).toBe('unavailable');
    expect(evaluateBooleanExpression(breakout, evaluation).status).toBe('unavailable');
  });

  it('历史值在本根才可见时保留其可见时间，不要求它曾在原收盘时可见', () => {
    const points = inputPoints(21);
    points[5] = { ...points[5]!, availableAt: at(20) };
    expect(evaluateNumericExpression(priorHighest, context(breakout, points))).toMatchObject({
      status: 'available',
      value: '100',
      availableAt: at(20),
    });
  });

  it('尚未可见的历史点不可用，不因批量物化绕过时钟', () => {
    const points = inputPoints(21);
    points[5] = { ...points[5]!, availableAt: at(22) };
    expect(evaluateBooleanExpression(breakout, context(breakout, points)).status).toBe(
      'unavailable',
    );
  });

  it.each([
    ['102', false],
    ['102.01', true],
  ] as const)('严格 102%% 阈值：%s -> %s', (close, value) => {
    const threshold: NumericExpression = {
      type: 'arithmetic',
      operator: 'multiply',
      left: {
        type: 'indicator',
        name: 'EMA',
        input: series('open'),
        params: { period: 20 },
      },
      right: constant('1.02'),
    };
    const entry: BooleanExpression = {
      type: 'compare',
      operator: 'gt',
      left: series('close'),
      right: threshold,
    };
    expect(definition(entry).entry).toEqual(entry);
    expect(evaluateBooleanExpression(entry, context(entry, inputPoints(20), close))).toMatchObject({
      status: 'available',
      value,
    });
  });

  it('精确四则、绝对值及上下界不把十进制字符串转为浮点', () => {
    const ctx = context(breakout, inputPoints(1));
    const operations = {
      add: '0.3',
      subtract: '0.1',
      multiply: '0.02',
      divide: '2',
      min: '0.1',
      max: '0.2',
    } as const;
    for (const [operator, expected] of Object.entries(operations)) {
      expect(
        evaluateNumericExpression(
          {
            type: 'arithmetic',
            operator: operator as keyof typeof operations,
            left: constant('0.2'),
            right: constant('0.1'),
          },
          ctx,
        ),
      ).toMatchObject({ status: 'available', value: expected });
    }
    expect(
      evaluateNumericExpression(
        { type: 'absolute', input: constant('-0.00000000000000000001') },
        ctx,
      ),
    ).toMatchObject({ status: 'available', value: '0.00000000000000000001' });
    expect(
      evaluateNumericExpression(
        { type: 'arithmetic', operator: 'divide', left: constant('1'), right: constant('0') },
        ctx,
      ),
    ).toMatchObject({ status: 'unavailable', reason: '除数为零' });
  });

  it('正式校验拒绝动态持仓历史、跨来源历史和量价混算', () => {
    for (const right of [
      { type: 'lag', periods: 1, input: { type: 'positionState', field: 'averageCost' } },
      { type: 'lag', periods: 0, input: highest },
      { type: 'arithmetic', operator: 'add', left: series('close'), right: series('volume') },
      { type: 'arithmetic', operator: 'multiply', left: series('close'), right: series('high') },
    ])
      expect(
        strategySchema.safeParse({ ...definition(breakout), entry: { ...breakout, right } })
          .success,
      ).toBe(false);
    const other = { ...definition(breakout).signalSources[0], id: 'other' };
    const mixed = {
      type: 'lag',
      periods: 1,
      input: {
        type: 'arithmetic',
        operator: 'subtract',
        left: series('close'),
        right: { type: 'series', sourceId: 'other', field: 'close' },
      },
    };
    expect(
      strategySchema.safeParse({
        ...definition(breakout),
        signalSources: [...definition(breakout).signalSources, other],
        entry: { ...breakout, right: mixed },
      }).success,
    ).toBe(false);
  });
});
