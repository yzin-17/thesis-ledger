import { z } from 'zod';
import type { SignalSource } from './backtest-values.js';

export const sessionValueExpressionSchema = z
  .object({
    type: z.literal('sessionValue'),
    sourceId: z.string().trim().min(1),
    field: z.enum(['vwap', 'elapsedMinutes']),
  })
  .strict();

export type SessionValueExpression = z.infer<typeof sessionValueExpressionSchema>;

/** 复用来源声明，完整性和真实日历只在冻结执行边界认证。 */
export function validateSessionValueSource(
  expression: SessionValueExpression,
  source: SignalSource | undefined,
): { field: 'sourceId' | 'field'; message: string } | undefined {
  if (!source || source.id !== expression.sourceId)
    return { field: 'sourceId', message: '会话数值引用未知行情来源' };
  if (source.timeframe === '1d' || source.asset.assetType === 'fund')
    return { field: 'sourceId', message: '会话数值只支持场内盘中行情来源' };
  if (!source.series.includes('close'))
    return { field: 'field', message: '会话数值需要来源声明收盘价' };
  if (expression.field === 'vwap' && !source.series.includes('volume'))
    return { field: 'field', message: '当日累计均价需要同一来源声明成交量' };
  return undefined;
}
