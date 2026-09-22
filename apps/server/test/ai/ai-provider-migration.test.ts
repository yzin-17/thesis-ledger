import { describe, expect, it } from 'vitest';
import { planAiProviderMigrations } from '../../src/ai/ai-provider-migration.js';

describe('AI Provider 兼容迁移 dry-run', () => {
  it('保留零价格精度，并为缺失模型生成逐模型迁移建议', () => {
    const report = planAiProviderMigrations([
      {
        name: 'legacy',
        settings: {
          models: ['model-a', 'model-b'],
          costPer1kInput: 0,
          costPer1kOutput: 0.00000123,
          costCurrency: 'USD',
        },
      },
    ]);

    expect(report.summary).toEqual({ providers: 1, noop: 0, ready: 1, conflicts: 0 });
    expect(report.items[0]).toMatchObject({
      status: 'ready',
      proposedModelPricing: {
        'model-a': { costPer1kInput: 0, costPer1kOutput: 0.00000123, costCurrency: 'USD' },
        'model-b': { costPer1kInput: 0, costPer1kOutput: 0.00000123, costCurrency: 'USD' },
      },
    });
  });

  it('不覆盖已有模型级价格，重复执行规划结果稳定', () => {
    const input = [
      {
        name: 'mixed',
        settings: {
          models: ['model-a', 'model-b'],
          modelPricing: {
            'model-a': {
              costPer1kInput: 0.1,
              costPer1kOutput: 0.2,
              costCurrency: 'USD',
              pricingVersion: 'user-v1',
            },
          },
          costPer1kInput: 0.3,
          costPer1kOutput: 0.4,
          costCurrency: 'USD',
        },
      },
    ] as const;

    const first = planAiProviderMigrations(input);
    const second = planAiProviderMigrations(input);
    expect(first).toEqual(second);
    const firstItem = first.items[0];
    if (!firstItem) throw new Error('missing migration plan');
    expect(firstItem).toMatchObject({
      status: 'ready',
      preservedModels: ['model-a'],
      proposedModelPricing: {
        'model-b': { costPer1kInput: 0.3, costPer1kOutput: 0.4, costCurrency: 'USD' },
      },
    });
    expect(firstItem.proposedModelPricing).not.toHaveProperty('model-a');
  });

  it('旧价格缺字段或旧路由重复时报告冲突，不静默补零或合并', () => {
    const report = planAiProviderMigrations([
      {
        name: 'conflict',
        settings: {
          models: ['model-a'],
          costPer1kInput: 0.1,
          executionRoutes: [
            { model: 'model-a', contract: { id: 'research' } },
            { model: 'model-a', contract: { id: 'research' } },
          ],
        },
      },
    ]);

    expect(report.summary.conflicts).toBe(1);
    const item = report.items[0];
    if (!item) throw new Error('missing migration plan');
    expect(item.status).toBe('conflict');
    expect(item.conflicts).toEqual(
      expect.arrayContaining(['旧价格缺少输出单价，不补零', '旧价格缺少币种，不补默认值']),
    );
    expect(item.conflicts).toEqual(
      expect.arrayContaining(['模型 model-a 的用途 research 存在重复路由']),
    );
    expect(item.proposedModelPricing['model-a']).toEqual({ costPer1kInput: 0.1 });
  });
});
