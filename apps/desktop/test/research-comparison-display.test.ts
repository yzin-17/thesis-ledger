import { expect, it } from 'vitest';
import {
  formatResearchComparisonValue,
  researchComparisonChoiceLabel,
} from '../src/features/ai/research-comparison-display.js';

it('数值零保持为零，币种和缺失值分别说明', () => {
  const value = formatResearchComparisonValue('numericClaims', [
    {
      kind: 'field',
      description: '受控价格',
      source: { value: 0, unit: 'price', currency: 'CNY' },
    },
  ]);
  expect(value).toContain('0 价格（CNY）');
  expect(
    formatResearchComparisonValue('numericClaims', [
      { kind: 'field', source: { value: null, currency: null } },
    ]),
  ).toContain('未记录');
});
it('质量限制保留前后含义，未知代码不冒充完整', () => {
  const value = formatResearchComparisonValue('quality', {
    status: 'partial',
    reasons: ['quote_policy_revision_unrecorded', 'controlled_unknown_reason'],
  });
  expect(value).toContain('报价策略修订未记录');
  expect(value).toContain('controlled_unknown_reason');
  expect(value).toContain('资料不完整');
  expect(formatResearchComparisonValue('quality', {})).toBe('质量状态未记录');
});
it('未知方向、范围与期限不猜测默认值', () => {
  expect(
    formatResearchComparisonValue('claims', [{ kind: 'price-direction', direction: 'unknown' }]),
  ).not.toContain('下跌');
  expect(formatResearchComparisonValue('scopeSnapshot', {})).toContain('模式未记录');
  expect(formatResearchComparisonValue('tradingDays', [{ tradingDays: null }])).toBe('期限未记录');
});
it('已知空列表与缺资料有区别，选择文案保留问题而不展示内部标识', () => {
  expect(formatResearchComparisonValue('risks', [])).toBe('未列出');
  expect(formatResearchComparisonValue('risks', null)).toBe('未记录');
  const label = researchComparisonChoiceLabel({
    id: 'internal-id',
    question: '原始中文问题',
    createdAt: '2026-10-18T08:00:00Z',
  });
  expect(label).toContain('原始中文问题');
  expect(label).not.toContain('internal-id');
});
