import type { z } from 'zod';
import { backtestDailyOrderExecutionSchema } from './backtest-daily-orders.js';
import { validateNumericExpression } from './backtest-expression-validation.js';
import type { NumericExpression } from './backtest-expression.js';
import type { SignalSource } from './backtest-values.js';

export function dailyOrderExecutionForStrategySchema(input: {
  sources: SignalSource[];
  instrument: SignalSource['asset'];
  timeframe: SignalSource['timeframe'];
  stageIds: string[];
  stageSides?: Record<string, 'buy' | 'sell'>;
}) {
  return backtestDailyOrderExecutionSchema.superRefine((execution, ctx) => {
    const sources = new Map(input.sources.map((source) => [source.id, source]));
    const stageIds = new Set(input.stageIds);
    execution.orders.forEach((template, index) => {
      const parent = execution.orders.find((order) => order.id === template.parent?.templateId);
      if (parent?.action.kind === 'stage' && input.stageSides?.[parent.action.stageId] !== 'buy')
        ctx.addIssue({
          code: 'custom',
          path: ['orders', index, 'parent'],
          message: '附属保护只能引用实际建仓或加仓动作',
        });
      if (template.action.kind === 'stage' && !stageIds.delete(template.action.stageId))
        ctx.addIssue({
          code: 'custom',
          path: ['orders', index, 'action', 'stageId'],
          message: '委托引用了不存在或重复的交易阶段',
        });
      if (template.order.kind !== 'market') {
        const path = ['orders', index, 'order', 'price'];
        validateNumericExpression(template.order.price, sources, ctx, path);
        validatePriceScope(template.order.price, input, sources, ctx, path);
      }
    });
    if (stageIds.size)
      ctx.addIssue({ code: 'custom', path: ['orders'], message: '每个交易阶段必须有对应委托模板' });
  });
}

function validatePriceScope(
  value: NumericExpression,
  input: {
    instrument: SignalSource['asset'];
    timeframe: SignalSource['timeframe'];
  },
  sources: Map<string, SignalSource>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (value.type === 'series' || value.type === 'sessionValue') {
    const source = sources.get(value.sourceId);
    if (
      source &&
      (source.asset.symbol !== input.instrument.symbol ||
        source.asset.market !== input.instrument.market ||
        source.asset.assetType !== input.instrument.assetType ||
        source.timeframe !== input.timeframe)
    )
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'sourceId'],
        message: '委托价格首批只支持同标的、同主周期来源',
      });
  }
  if (value.type === 'indicator')
    validatePriceScope(value.input, input, sources, ctx, [...path, 'input']);
}
