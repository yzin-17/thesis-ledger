import { expect, it } from 'vitest';
import {
  sessionValueExpressionSchema,
  validateSessionValueSource,
} from '../src/backtest-session-expression.js';
import type { SignalSource } from '../src/backtest-values.js';

const source: SignalSource = {
  id: 'main',
  asset: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
  timeframe: '5m',
  series: ['close', 'volume'],
};
const expression = sessionValueExpressionSchema.parse({
  type: 'sessionValue',
  sourceId: 'main',
  field: 'vwap',
});

it('会话来源必须是同一场内盘中量价，时间数值可只声明收盘价', () => {
  expect(validateSessionValueSource(expression, source)).toBeUndefined();
  for (const candidate of [
    undefined,
    { ...source, id: 'other' },
    { ...source, timeframe: '1d' as const },
    { ...source, asset: { ...source.asset, assetType: 'fund' as const } },
    { ...source, series: ['volume'] as const },
    { ...source, series: ['close'] as const },
  ]) {
    expect(
      validateSessionValueSource(expression, candidate as SignalSource | undefined),
    ).toBeDefined();
  }
  expect(
    validateSessionValueSource(
      { ...expression, field: 'elapsedMinutes' },
      { ...source, series: ['close'] },
    ),
  ).toBeUndefined();
});

it('拒绝滚动窗口、任意字段和额外价格输入，避免悄悄换成滚动或跨来源统计', () => {
  for (const patch of [
    { period: 20 },
    { input: { type: 'series', sourceId: 'other', field: 'close' } },
    { field: 'rollingVwap' },
    { sourceId: '' },
    { type: 'indicator' },
  ]) {
    expect(sessionValueExpressionSchema.safeParse({ ...expression, ...patch }).success).toBe(false);
  }
});
