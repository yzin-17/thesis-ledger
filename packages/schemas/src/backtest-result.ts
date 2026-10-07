import { z } from 'zod';
import { executionPriceProtocolSchema } from './market-price-protocol.js';
import { decimalStringSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { executionModelDisclosureSchemaV3 } from './backtest-execution-model.js';
import { backtestSnapshotActualSourceV3Schema } from './backtest-data.js';
import { backtestMoneySchema } from './backtest-values.js';
const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });
export const simulationFillSchema = z
  .object({
    fillId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    executionSymbol: z.string().trim().min(1),
    side: z.enum(['buy', 'sell']),
    quantity: positiveDecimalStringSchema,
    price: positiveDecimalStringSchema,
    charges: z.array(backtestMoneySchema),
    occurredAt: z.iso.datetime({ offset: true }),
    availableAt: z.iso.datetime({ offset: true }),
    reason: z.enum(['signal', 'risk']),
  })
  .strict();
export type SimulationFill = z.infer<typeof simulationFillSchema>;

export const backtestTradeSchema = z
  .object({
    source: z.literal('BACKTEST'),
    executionSymbol: z.string().trim().min(1),
    openedAt: z.iso.datetime({ offset: true }),
    closedAt: z.iso.datetime({ offset: true }),
    entryQuantity: positiveDecimalStringSchema,
    exitQuantity: positiveDecimalStringSchema,
    entryValue: backtestMoneySchema,
    exitValue: backtestMoneySchema,
    realizedPnl: backtestMoneySchema,
    charges: z.array(backtestMoneySchema),
    returnRate: decimalStringSchema,
    closeReason: z.enum(['signal', 'risk']),
    fillIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
export type BacktestTrade = z.infer<typeof backtestTradeSchema>;

export const backtestMetricSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'warning']),
    value: decimalStringSchema.optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'available' && value.value === undefined)
      issue(ctx, ['value'], 'available 指标必须有 value');
    if (value.status !== 'available' && value.reason === undefined)
      issue(ctx, ['reason'], '不可用或警告指标必须有 reason');
  });

export const rejectedBacktestOrderSchema = z
  .object({
    orderId: z.string().trim().min(1),
    executionSymbol: z.string().trim().min(1),
    side: z.enum(['buy', 'sell']),
    reasonCode: z.string().trim().min(1),
    message: z.string().trim().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const backtestEquityPointSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    value: backtestMoneySchema,
    availableAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const backtestDrawdownPointSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
    equity: backtestMoneySchema,
    peak: backtestMoneySchema,
    drawdown: decimalStringSchema,
    availableAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const backtestResultCoreFields = {
  source: z.literal('BACKTEST'),
  runId: z.string().trim().min(1),
  strategyVersionId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  engineVersion: z.string().trim().min(1),
  marketRuleVersion: z.string().trim().min(1),
  calendarVersion: z.string().trim().min(1),
  aggregationVersion: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  resultChecksum: z.string().trim().min(1),
  completeness: z.enum(['complete', 'partial', 'unavailable']),
  warnings: z.array(z.string()),
  rejectedOrders: z.array(rejectedBacktestOrderSchema),
  rejectedNavRequests: z.array(rejectedBacktestOrderSchema).optional(),
  simulationFills: z.array(simulationFillSchema),
  trades: z.array(backtestTradeSchema),
  equityCurve: z.array(backtestEquityPointSchema),
  drawdownCurve: z.array(backtestDrawdownPointSchema).optional(),
  metrics: z.record(z.string(), backtestMetricSchema),
  benchmark: z.record(z.string(), backtestMetricSchema).optional(),
};

const sha256FingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const benchmarkReportFingerprintSchema = z.string().regex(/^[a-f0-9]{16}$/);

export const backtestBenchmarkCompatibilityFieldV3Schema = z.enum([
  'priceProtocol',
  'returnProtocol',
  'historyProtocol',
  'costAssumption',
  'source',
  'dividendAssumption',
]);
export type BacktestBenchmarkCompatibilityFieldV3 = z.infer<
  typeof backtestBenchmarkCompatibilityFieldV3Schema
>;

export const backtestBenchmarkCostAssumptionV3Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('zero-cost'), version: z.string().trim().min(1) }),
  z.strictObject({
    kind: z.literal('proportional'),
    version: z.string().trim().min(1),
    commissionRate: decimalStringSchema,
    slippageRate: decimalStringSchema,
  }),
  z.strictObject({
    kind: z.literal('unsupported'),
    version: z.string().trim().min(1),
    fingerprint: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('unavailable') }),
]);
export type BacktestBenchmarkCostAssumptionV3 = z.infer<
  typeof backtestBenchmarkCostAssumptionV3Schema
>;

export const backtestBenchmarkCompatibilitySchemaV3 = z
  .strictObject({
    status: z.enum(['compatible', 'incompatible', 'unverified']),
    strategyFingerprint: benchmarkReportFingerprintSchema.optional(),
    benchmarkFingerprint: benchmarkReportFingerprintSchema.optional(),
    missingFields: z.array(backtestBenchmarkCompatibilityFieldV3Schema),
    differentFields: z.array(backtestBenchmarkCompatibilityFieldV3Schema),
    costAssumption: backtestBenchmarkCostAssumptionV3Schema,
  })
  .superRefine((report, context) => {
    const missingFields = new Set(report.missingFields);
    const differentFields = new Set(report.differentFields);
    if (missingFields.size !== report.missingFields.length) {
      issue(context, ['missingFields'], 'missingFields 不能重复');
    }
    if (differentFields.size !== report.differentFields.length) {
      issue(context, ['differentFields'], 'differentFields 不能重复');
    }
    if (report.missingFields.some((field) => differentFields.has(field))) {
      issue(context, ['differentFields'], '同一字段不能同时缺失和不同');
    }
    if (report.status === 'compatible' && (missingFields.size > 0 || differentFields.size > 0)) {
      issue(context, ['status'], '兼容报告不能包含缺失或不同字段');
    }
    if (report.status === 'incompatible' && differentFields.size === 0) {
      issue(context, ['differentFields'], '不兼容报告必须至少包含一个不同字段');
    }
    if (report.status === 'unverified' && (missingFields.size === 0 || differentFields.size > 0)) {
      issue(context, ['status'], '未核验报告必须有缺失字段且不能包含不同字段');
    }
    if (report.costAssumption.kind === 'unavailable' && !missingFields.has('costAssumption')) {
      issue(context, ['costAssumption'], '成本假设不可用时必须报告成本身份缺失');
    }
    if (
      report.costAssumption.kind === 'zero-cost' &&
      report.costAssumption.version === 'legacy-v2-zero-cost'
    ) {
      issue(context, ['costAssumption'], 'V3 结果不能继承 V2 的隐式零成本假设');
    }
  });
export type BacktestBenchmarkCompatibilityV3 = z.infer<
  typeof backtestBenchmarkCompatibilitySchemaV3
>;

export const backtestResultSchemaV3 = z
  .strictObject({
    ...backtestResultCoreFields,
    schemaVersion: z.literal('3'),
    snapshotVersion: z.literal('snapshot-manifest-v3'),
    executionModelDisclosure: executionModelDisclosureSchemaV3.optional(),
    executionPriceProtocol: executionPriceProtocolSchema,
    comparableDataFingerprint: sha256FingerprintSchema,
    actualSources: z.array(backtestSnapshotActualSourceV3Schema).min(1),
    benchmarkCompatibility: backtestBenchmarkCompatibilitySchemaV3.optional(),
  })
  .superRefine((result, context) => {
    const executionSources = result.actualSources.filter(
      (source) => source.purpose === 'execution',
    );
    if (executionSources.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['actualSources'],
        message: 'V3 结果必须引用唯一的实际执行行情来源',
      });
      return;
    }
    const executionSource = executionSources[0]!;
    if (
      executionSource.routeKey.kind === 'bar' &&
      executionSource.routeKey.adjustment !== result.executionPriceProtocol.priceBasis.adjustment
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actualSources'],
        message: 'V3 结果的执行来源口径必须与价格协议一致',
      });
    }
  });
export type BacktestResultV3 = z.infer<typeof backtestResultSchemaV3>;

export const backtestErrorCodes = [
  'INVALID_SCHEMA',
  'UNKNOWN_FIELD',
  'UNKNOWN_SOURCE',
  'UNKNOWN_SERIES',
  'UNKNOWN_INDICATOR',
  'INVALID_PARAMETER',
  'TYPE_MISMATCH',
  'UNSUPPORTED_CAPABILITY',
  'DATA_UNAVAILABLE',
  'INSUFFICIENT_CASH',
  'INSUFFICIENT_POSITION',
  'ORDER_REJECTED',
  'SNAPSHOT_HASH_MISMATCH',
  'FUTURE_DATA',
  'RULE_REJECTED',
  'NAV_DELAYED',
  'UNSUPPORTED_CORPORATE_ACTION',
  'ARTIFACT_UNAVAILABLE',
  'CANCELLED',
  'INTERNAL_ERROR',
] as const;
export const backtestErrorSchema = z
  .object({
    code: z.enum(backtestErrorCodes),
    message: z.string().trim().min(1),
    path: z.array(z.union([z.string(), z.number()])),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type BacktestError = z.infer<typeof backtestErrorSchema>;
export type BacktestErrorCode = (typeof backtestErrorCodes)[number];
