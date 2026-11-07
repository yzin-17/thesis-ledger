import { expect, it } from 'vitest';
import { arenaRatio, arenaObservationLabel } from '../src/arena-display.js';
it.each([
  ['0.01005000000000000000001', '1.01%'],
  ['0.' + '0'.repeat(399) + '1', '1E-398%'],
  ['-0.' + '0'.repeat(399) + '1', '-1E-398%'],
  ['1' + '0'.repeat(400), '1E402%'],
  [null, '资料不足'],
  ['invalid', '资料不足'],
] as const)('竞赛实际比例 %s 展示 %s', (value, expected) => {
  expect(arenaRatio(value)).toBe(expected);
});
it('观察摘要保持状态边界且不改写冻结输入', () => {
  const row = {
    state: 'ready' as const,
    change: '0.' + '0'.repeat(399) + '1',
    high: '0.0100500000000000001',
    low: null,
  };
  const before = JSON.stringify(row);
  expect(arenaObservationLabel(row)).toBe('涨跌 1E-398% · 区间最高 1.01% · 区间最低 资料不足');
  expect(JSON.stringify(row)).toBe(before);
  expect(arenaObservationLabel({ ...row, state: 'pending' })).toBe('未到观察期');
});
