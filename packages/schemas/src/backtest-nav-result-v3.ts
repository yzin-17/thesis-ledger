import { z } from 'zod';
import {
  backtestResultSchemaV3,
  backtestTradeSchema,
  backtestMetricSchema,
  backtestEquityPointSchema,
  backtestDrawdownPointSchema,
  simulationFillSchema,
} from './backtest-contract.js';
import { backtestNavSnapshotManifestV3Schema } from './backtest-nav-freeze-v3.js';
import { backtestNavVisibilityV3Schema } from './backtest-nav-visibility-v3.js';
import { executionModelDisclosureSchemaV3 } from './backtest-execution-model.js';
import {
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from './monetary-values.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

const text = z.string().trim().min(1);
const time = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const symbol = z.string().regex(/^\d{6}\.OF$/);
const notAfter = (left: string, right: string) => {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  return order !== undefined && order <= 0;
};

export const backtestNavRequestResultV3Schema = z.strictObject({
  requestId: text,
  requestType: z.enum(['subscribe', 'redeem']),
  executionSymbol: symbol,
  status: z.enum([
    'pending',
    'priced',
    'confirmed',
    'shareAvailable',
    'settled',
    'cancelled',
    'rejected',
  ]),
  requestAt: time,
  fee: nonNegativeDecimalStringSchema,
  cutoffAt: time.optional(),
  valuationDate: z.iso.date().optional(),
  nav: positiveDecimalStringSchema.optional(),
  navOccurredAt: time.optional(),
  navAvailableAt: time.optional(),
  navProvider: text.optional(),
  navProviderRevision: text.optional(),
  navFreshness: z.enum(['live', 'delayed', 'stale', 'unknown']).optional(),
  navQuality: z.enum(['complete', 'partial', 'suspended', 'stale', 'unknown']).optional(),
  requestedAmount: nonNegativeDecimalStringSchema.optional(),
  requestedShares: nonNegativeDecimalStringSchema.optional(),
  confirmedShares: nonNegativeDecimalStringSchema.optional(),
  expectedCashSettlement: nonNegativeDecimalStringSchema.optional(),
  confirmationAt: time.optional(),
  shareAvailableAt: time.optional(),
  redemptionCashAt: time.optional(),
  fillId: text.optional(),
  reason: text.optional(),
});

const visibilityDisclosure = z.discriminatedUnion('classification', [
  z.strictObject({
    classification: z.literal('research-assumption'),
    strictPit: z.literal(false),
    assumptions: z.array(text).min(1),
  }),
  z.strictObject({
    classification: z.literal('strict-publication'),
    requiresSourcePitAdmission: z.literal(true),
    assumptions: z.array(text).length(0),
  }),
]);

const fields = {
  source: z.literal('BACKTEST'),
  inputKind: z.literal('nav'),
  schemaVersion: z.literal('3'),
  snapshotVersion: z.literal('snapshot-manifest-v3'),
  engineVersion: text,
  runId: text,
  strategyVersionId: text,
  snapshotId: hash,
  contentHash: hash,
  comparableDataFingerprint: hash,
  resultChecksum: z.string().regex(/^[a-f0-9]{16}$/),
  dataAsOf: time,
  evaluatedAt: time,
  dateRange: z.strictObject({ startDate: z.iso.date(), endDate: z.iso.date() }),
  executionSymbol: symbol,
  calendarVersion: text,
  executionModelDisclosure: executionModelDisclosureSchemaV3.extend({ contentHash: hash }),
  navVisibility: backtestNavVisibilityV3Schema,
  visibilityDisclosure,
  navSource: backtestNavSnapshotManifestV3Schema.shape.source,
  completeness: z.enum(['complete', 'partial', 'unavailable']),
  warnings: z.array(text),
  diagnostics: z.array(
    z.strictObject({ eventId: text, requestId: text.optional(), code: text, reason: text }),
  ),
  requests: z.array(backtestNavRequestResultV3Schema),
  pendingRequestIds: z.array(text),
  cash: z.strictObject({
    settled: decimalStringSchema,
    unsettled: decimalStringSchema,
    currency: z.literal('CNY'),
  }),
  position: z.strictObject({
    quantity: nonNegativeDecimalStringSchema,
    settledQuantity: nonNegativeDecimalStringSchema,
    unsettledQuantity: nonNegativeDecimalStringSchema,
    averageCost: nonNegativeDecimalStringSchema,
  }),
  simulationFills: z.array(simulationFillSchema),
  trades: z.array(backtestTradeSchema),
  equityCurve: z.array(backtestEquityPointSchema).min(2),
  drawdownCurve: z.array(backtestDrawdownPointSchema),
  metrics: z.record(text, backtestMetricSchema),
  benchmark: z.record(text, backtestMetricSchema),
};

const validateRequests = (value: z.infer<z.ZodObject<typeof fields>>, ctx: z.RefinementCtx) => {
  const ids = new Set<string>();
  const pending = value.requests
    .filter((request) =>
      ['pending', 'priced', 'confirmed', 'shareAvailable'].includes(request.status),
    )
    .map((request) => request.requestId);
  if (
    new Set(value.pendingRequestIds).size !== value.pendingRequestIds.length ||
    [...pending].sort().join('\0') !== [...value.pendingRequestIds].sort().join('\0')
  )
    ctx.addIssue({
      code: 'custom',
      path: ['pendingRequestIds'],
      message: '待处理申请必须与申请状态完全一致',
    });
  for (const [index, request] of value.requests.entries()) {
    if (ids.has(request.requestId) || request.executionSymbol !== value.executionSymbol)
      ctx.addIssue({
        code: 'custom',
        path: ['requests', index],
        message: '申请身份重复或标的不符',
      });
    ids.add(request.requestId);
    for (const instant of [
      request.requestAt,
      request.navAvailableAt,
      request.confirmationAt,
      request.shareAvailableAt,
      request.redemptionCashAt,
    ]) {
      if (instant && !notAfter(instant, value.evaluatedAt))
        ctx.addIssue({
          code: 'custom',
          path: ['requests', index],
          message: '申请状态包含期末之后的事实',
        });
    }
    if (
      ['priced', 'confirmed', 'shareAvailable', 'settled'].includes(request.status) &&
      (!request.nav ||
        !request.valuationDate ||
        !request.navAvailableAt ||
        !request.navProviderRevision)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['requests', index],
        message: '已定价申请必须保留净值与来源',
      });
    if (
      ['confirmed', 'shareAvailable', 'settled'].includes(request.status) &&
      (!request.fillId ||
        !request.confirmedShares ||
        !request.confirmationAt ||
        !request.expectedCashSettlement)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['requests', index],
        message: '已确认申请必须保留成交与经济结果',
      });
  }
};

const validateOutputTimeline = (
  value: z.infer<z.ZodObject<typeof fields>>,
  ctx: z.RefinementCtx,
) => {
  const start = `${value.dateRange.startDate}T00:00:00+08:00`;
  const end = `${value.dateRange.endDate}T23:59:59.999999+08:00`;
  if (!notAfter(start, value.evaluatedAt) || !notAfter(value.evaluatedAt, end))
    ctx.addIssue({
      code: 'custom',
      path: ['evaluatedAt'],
      message: '净值结果评估时刻必须在声明的运行窗口内',
    });
  for (const request of value.requests) {
    if (!notAfter(start, request.requestAt))
      ctx.addIssue({ code: 'custom', path: ['requests'], message: '预热申请不能进入执行结果' });
  }
  for (const point of [...value.equityCurve, ...value.drawdownCurve]) {
    if (
      !notAfter(start, point.occurredAt) ||
      (point.availableAt && !notAfter(point.availableAt, value.evaluatedAt))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['equityCurve'],
        message: '权益事实时间不在冻结执行窗口内',
      });
  }
  if (
    value.navVisibility.mode === 'research-assumption' &&
    value.navVisibility.rule.symbol !== value.executionSymbol
  )
    ctx.addIssue({ code: 'custom', path: ['navVisibility'], message: '研究规则必须属于执行基金' });
};

const validateFillRequests = (value: z.infer<z.ZodObject<typeof fields>>, ctx: z.RefinementCtx) => {
  const requests = new Map(
    value.requests
      .filter((request) => request.fillId)
      .map((request) => [request.requestId, request]),
  );
  const ids = new Set(value.simulationFills.map((fill) => fill.fillId));
  if (requests.size !== value.simulationFills.length || ids.size !== value.simulationFills.length)
    ctx.addIssue({
      code: 'custom',
      path: ['simulationFills'],
      message: '确认申请与成交必须一一对应',
    });
  for (const fill of value.simulationFills) {
    const request = requests.get(fill.orderId);
    if (
      !request ||
      fill.fillId !== request.fillId ||
      fill.executionSymbol !== value.executionSymbol ||
      fill.quantity !== request.confirmedShares ||
      fill.price !== request.nav ||
      fill.availableAt !== request.confirmationAt ||
      fill.charges.length !== 1 ||
      fill.charges[0]?.amount !== request.fee ||
      fill.charges[0]?.currency !== 'CNY'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['simulationFills'],
        message: '净值成交、费用与确认申请不符',
      });
  }
  for (const trade of value.trades) {
    if (trade.executionSymbol !== value.executionSymbol || trade.fillIds.some((id) => !ids.has(id)))
      ctx.addIssue({
        code: 'custom',
        path: ['trades'],
        message: '净值交易引用了未声明的成交或标的',
      });
  }
};

export const backtestNavResultV3Schema = z.strictObject(fields).superRefine((value, ctx) => {
  if (
    value.snapshotId !== value.contentHash ||
    value.dateRange.startDate > value.dateRange.endDate ||
    !notAfter(value.evaluatedAt, value.dataAsOf) ||
    !notAfter(value.navSource.capturedAt, value.dataAsOf)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['contentHash'],
      message: '净值结果的冻结身份或时间不符',
    });
  const model = value.executionModelDisclosure.model;
  if (
    model.scope.symbol !== value.executionSymbol ||
    model.scope.market !== 'CN' ||
    model.scope.instrumentType !== 'NAV_FUND' ||
    model.scope.currency !== 'CNY' ||
    model.segments.some((segment) => segment.execution.mode !== 'nav')
  )
    ctx.addIssue({
      code: 'custom',
      path: ['executionModelDisclosure'],
      message: '净值结果必须使用同基金申赎模型',
    });
  if (value.navVisibility.mode !== value.visibilityDisclosure.classification)
    ctx.addIssue({
      code: 'custom',
      path: ['visibilityDisclosure'],
      message: '可见性模式与结果披露不符',
    });
  if (
    value.completeness === 'complete' &&
    (value.pendingRequestIds.length || value.diagnostics.length)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['completeness'],
      message: '待处理或被拒绝申请不能声明完整执行',
    });
  for (const point of [...value.equityCurve, ...value.drawdownCurve]) {
    if (!notAfter(point.occurredAt, value.evaluatedAt))
      ctx.addIssue({
        code: 'custom',
        path: ['equityCurve'],
        message: '权益或回撤曲线不能延伸到期末之后',
      });
  }
  validateRequests(value, ctx);
  validateOutputTimeline(value, ctx);
  validateFillRequests(value, ctx);
});
export type BacktestNavResultV3 = z.infer<typeof backtestNavResultV3Schema>;

/** 新消费端显式选择净值或现行场内结果；既有场内端点由 Worker 汇合后迁移。 */
export const backtestExecutionResultV3Schema = z.union([
  backtestNavResultV3Schema,
  backtestResultSchemaV3,
]);
export type BacktestExecutionResultV3 = z.infer<typeof backtestExecutionResultV3Schema>;
