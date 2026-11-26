import { z } from 'zod';
import { assetSymbolRefSchema, backtestTimeframeSchema, seriesFieldSchema } from './backtest-values.js';

const count = z.number().int().nonnegative();
const coordinate = z.enum(['research', 'actual']);
export const backtestResearchDataScopeSchema = z.strictObject({
  executionInstrument: assetSymbolRefSchema,
  version: z.literal(1),
  priceCoordinates: z.array(coordinate).min(1).max(2),
  sources: z.array(z.strictObject({
    sourceId: z.string().min(1).max(120), coordinate, timeframe: backtestTimeframeSchema,
    fields: z.array(seriesFieldSchema).min(1).max(6), warmupRows: count, observedRows: count,
    fieldWindows: z.array(z.strictObject({ field: seriesFieldSchema, validRows: count,
      warmupRows: count, longestWindowRows: count })).max(6),
    volumeBasis: z.enum(['original', 'split-adjusted', 'unknown']),
  })).min(1).max(12),
  sizingModes: z.array(z.enum(['fixedAmount', 'equityRatio', 'fixedQuantity'])).min(1).max(3),
  unavailableCapabilities: z.array(z.strictObject({ capability: z.string().min(1).max(120),
    code: z.string().min(1).max(120), message: z.string().max(1000).optional() })).max(32),
}).superRefine((scope, context) => {
  scope.sources.forEach((source, index) => {
    const base = ['sources', index];
    if (new Set(source.fields).size !== source.fields.length ||
        new Set(source.fieldWindows.map((window) => window.field)).size !== source.fieldWindows.length)
      context.addIssue({ code: 'custom', path: base, message: '能力来源字段不得重复' });
    for (const window of source.fieldWindows) {
      if (window.longestWindowRows > window.validRows || window.warmupRows > window.validRows ||
          window.validRows > source.observedRows)
        context.addIssue({ code: 'custom', path: [...base, 'fieldWindows'], message: '字段有效窗口统计不一致' });
    }
    if (source.warmupRows > source.observedRows || source.fields.some((field) =>
      !source.fieldWindows.some((window) => window.field === field && window.validRows > 0)))
      context.addIssue({ code: 'custom', path: base, message: '可用字段必须具有真实有效观测' });
  });
});
export type BacktestResearchDataScope = z.infer<typeof backtestResearchDataScopeSchema>;
