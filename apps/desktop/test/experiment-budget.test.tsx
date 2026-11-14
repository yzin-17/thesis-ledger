import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { optimizationBudgetSchema, optimizationBudgetLimits } from '@thesis-ledger/schemas';
import {
  experimentBudgetError,
  experimentCreateFailure,
  type ExperimentBudgetDraft,
} from '../src/features/strategy/experiment-budget.js';
import { ExperimentBudgetFields } from '../src/features/strategy/ExperimentBudgetFields.js';

const budget = {
  maxAiCalls: 6,
  maxBacktestRuns: 20,
  maxInputTokens: 100000,
  maxOutputTokens: 20000,
  maxDurationSeconds: 1800,
};
describe('实验预算填写与创建校验', () => {
  it('复现截图中所有超限值，并提供中文字段与真实允许范围', () => {
    const input = {
      ...budget,
      maxBacktestRuns: 200,
      maxInputTokens: 100000000,
      maxOutputTokens: 20000000,
      maxDurationSeconds: 180000,
    };
    const error = experimentBudgetError(input);
    expect(error).toContain('回测次数上限填 0 表示不限制');
    expect(error).toContain('输入 Token 上限填 0 表示不限制');
    expect(error).toContain('输出 Token 上限填 0 表示不限制');
    expect(error).toContain('时长上限（秒）须为 30–86,400');
    expect(optimizationBudgetSchema.safeParse(input).success).toBe(false);
  });
  it.each(Object.entries(optimizationBudgetLimits))(
    '%s 的边界与公共合同一致且拒绝非整数',
    (field, limits) => {
      expect(experimentBudgetError({ ...budget, [field]: limits.min })).toBeNull();
      expect(experimentBudgetError({ ...budget, [field]: limits.max })).toBeNull();
      for (const value of [-1, limits.max + 1, limits.min + 0.5, NaN, Infinity])
        expect(experimentBudgetError({ ...budget, [field]: value })).not.toBeNull();
      expect(experimentBudgetError({ ...budget, [field]: 0 }) === null).toBe('unlimited' in limits);
    },
  );
  it('费用格式错误明确显示，保持原始输入不自动压缩', () => {
    const input = { ...budget, maxCost: '1.234567890123456789' };
    expect(experimentBudgetError(input)).toBeNull();
    expect(input.maxCost).toBe('1.234567890123456789');
    expect(experimentBudgetError({ ...budget, maxCost: '-1' })).toContain('费用上限');
  });
  it('创建合同错误保留中文细节，其他请求错误沿用现有表达', () => {
    expect(
      experimentCreateFailure({
        issues: [{ path: ['budget', 'maxBacktestRuns'], message: 'Too big' }],
      }),
    ).toContain('2–100');
    expect(
      experimentCreateFailure({
        issues: [{ path: ['budget'], message: '回测预算至少需要 8 次以预留最终验证' }],
      }),
    ).toContain('至少需要 8');
    expect(
      experimentCreateFailure({ issues: [{ path: ['runConfig'], message: 'Invalid input' }] }),
    ).toContain('重新准备实验配置');
    expect(experimentCreateFailure(new Error('受控创建失败'))).toBe('受控创建失败');
  });
  it('输入控件显示真实上下限，非法输入直接显示字段错误', () => {
    const value = Object.fromEntries(
      Object.entries(budget).map(([key, number]) => [key, String(number)]),
    ) as ExperimentBudgetDraft;
    const html = renderToStaticMarkup(
      <ExperimentBudgetFields
        value={{ ...value, maxBacktestRuns: '200' }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('min="0" max="100" step="1"');
    expect(html).toContain('value="200"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('回测次数上限填 0 表示不限制');
  });
  it.each(['maxAiCalls', 'maxBacktestRuns', 'maxInputTokens', 'maxOutputTokens'] as const)('%s 的 0 是明确不限额，空输入仍标错', (field) => {
    expect(experimentBudgetError({ ...budget, maxBacktestRuns: 0 })).toBeNull();
    expect(experimentBudgetError({ ...budget, maxAiCalls: 0 })).toBeNull();
    const value = Object.fromEntries(
      Object.entries(budget).map(([key, number]) => [key, String(number)]),
    ) as ExperimentBudgetDraft;
    const html = renderToStaticMarkup(
      <ExperimentBudgetFields
        value={{ ...value, [field]: '0' }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('填 0 表示不限制');
    expect(html).not.toContain('aria-invalid="true"');
    const empty = renderToStaticMarkup(
      <ExperimentBudgetFields
        value={{ ...value, [field]: '' }}
        onChange={() => undefined}
      />,
    );
    expect(empty).toContain('aria-invalid="true"');
  });
});
