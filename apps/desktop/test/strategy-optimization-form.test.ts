import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  objectiveLabels,
} from '../src/features/strategy/StrategyOptimizationExperimentPanel.js';
import {
  isReasoningEffortValid,
  limitSelectedModels,
  routeKey,
  StrategyOptimizationModelSelector,
} from '../src/features/strategy/StrategyOptimizationModelSelector.js';

describe('策略优化实验表单契约', () => {
  it('用中文显示优化目标，同时保持稳定 wire value', () => {
    expect(objectiveLabels.balanced).toBe('收益 / 回撤平衡');
    expect(Object.keys(objectiveLabels)).toEqual(['return', 'drawdown', 'balanced', 'lowTurnover']);
  });

  it('从前一段结束日派生连续区间起始日', () => {
    expect(addDays('2026-03-18', 1)).toBe('2026-03-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('以结构化安全 key 区分包含冒号的 Provider/Model', () => {
    expect(routeKey('provider:a', 'model')).not.toBe(routeKey('provider', 'a:model'));
  });

  it('未显式选择时保留 omission，mandatory 只禁止显式 none', () => {
    const reasoning = { supportedEfforts: ['none', 'high'], mandatory: true } as const;
    expect(isReasoningEffortValid(reasoning, undefined)).toBe(true);
    expect(isReasoningEffortValid(reasoning, 'high')).toBe(true);
    expect(isReasoningEffortValid(reasoning, 'none')).toBe(false);
  });

  it('模型选择最多保留三个路由', () => {
    expect(limitSelectedModels(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('模型选择器不会在 Field 上下文之外渲染 FieldDescription', () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(StrategyOptimizationModelSelector, {
          routes: [],
          selectedModels: [],
          onSelectedModelsChange: () => undefined,
          reasoningEfforts: {},
          onReasoningEffortsChange: () => undefined,
        }),
      ),
    ).not.toThrow();
  });
});
