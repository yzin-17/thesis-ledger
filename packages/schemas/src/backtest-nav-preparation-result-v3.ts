import { z } from 'zod';
import { backtestNavRunConfigV3Schema } from './backtest-nav-freeze-v3.js';
import { backtestNavSourceResponseV3Schema } from './backtest-nav-source-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
const range = z.strictObject({ startDate: z.iso.date(), endDate: z.iso.date() });
export const backtestNavPreparationReceiptV3Schema = z.strictObject({
  preparationId: z.uuid(),
  preparationHash: hash,
  expiresAt: instant,
});
export const backtestNavPreparationBindingV3Schema = z.strictObject({
  strategyVersionId: z.uuid(),
  strategyContentHash: hash,
  intentHash: hash,
  runConfigChecksum: hash,
  inputPlanHash: hash,
  sourceRequestHash: hash,
  sourceResponseHash: hash,
  routeStateHash: hash,
  admissionHash: hash,
  preparationHash: hash,
  startedAt: instant,
  checkedAt: instant,
});
const summary = z.strictObject({
  version: z.literal('nav-input-plan-v1'),
  runWindow: range,
  navRange: range,
  requiredCalendarRange: range,
  warmupPeriods: z.number().int().positive(),
  tailTradingDays: z.number().int().positive(),
  disclosureTailWorkdays: z.number().int().positive(),
  expectedValuationDates: z.array(z.iso.date()).min(1).max(100000),
  priceInputs: z
    .array(
      z.strictObject({
        purpose: z.enum(['execution', 'signal', 'benchmark']),
        sourceId: z.string().min(1).optional(),
        artifactKey: z.literal('execution/nav.parquet'),
        range,
      }),
    )
    .min(2),
});
const sourceShape = backtestNavSourceResponseV3Schema.shape;
const actualSource = z.strictObject({
  routeKey: sourceShape.routeKey,
  routeTarget: sourceShape.routeTarget,
  desiredRevision: sourceShape.desiredRevision,
  effectivePolicyRevision: sourceShape.effectivePolicyRevision,
  catalogRevision: sourceShape.catalogRevision,
  source: sourceShape.source,
  admission: sourceShape.admission,
});
export const backtestNavPreparationDiagnosticV3Schema = z.strictObject({
  code: z.enum([
    'DATA_UNAVAILABLE',
    'PREPARATION_STALE',
    'SOURCE_TIMEOUT',
    'SOURCE_UNAVAILABLE',
    'SOURCE_UNAUTHORIZED',
    'SOURCE_INVALID_RESPONSE',
    'SOURCE_UNSUPPORTED',
    'SOURCE_NOT_ADMITTED',
  ]),
  severity: z.literal('error'),
  message: z.string().min(1),
});
const base = {
  contractVersion: z.literal(3),
  requestId: z.string().min(1).max(128),
  checkedAt: instant,
  scope: z.literal('nav-input-plan'),
};
export const backtestNavPreparationBlockedResultV3Schema = z.strictObject({
  ...base,
  status: z.literal('blocked'),
  diagnostics: z.array(backtestNavPreparationDiagnosticV3Schema).min(1),
});
export const backtestNavPreparationResultV3Schema = z.discriminatedUnion('status', [
  z
    .strictObject({
      ...base,
      status: z.literal('prepared'),
      receipt: backtestNavPreparationReceiptV3Schema.optional(),
      runConfig: backtestNavRunConfigV3Schema,
      binding: backtestNavPreparationBindingV3Schema,
      inputPlanSummary: summary,
      actualSource,
    })
    .superRefine((value, ctx) => {
      const { runConfig, binding, inputPlanSummary: plan, actualSource: source } = value;
      const ordered = compareMarketPitEvidenceInstantStringsV1(binding.startedAt, value.checkedAt);
      const captured = compareMarketPitEvidenceInstantStringsV1(
        source.source.capturedAt,
        value.checkedAt,
      );
      if (
        binding.checkedAt !== value.checkedAt ||
        (value.receipt !== undefined &&
          (value.receipt.preparationHash !== binding.preparationHash ||
            Date.parse(value.receipt.expiresAt) <= Date.parse(value.checkedAt))) ||
        runConfig.dataAsOf !== value.checkedAt ||
        ordered === undefined ||
        ordered > 0 ||
        captured === undefined ||
        captured > 0 ||
        runConfig.navVisibility.mode !== 'research-assumption' ||
        source.desiredRevision !== source.effectivePolicyRevision ||
        !source.admission.scopeSymbols.includes(runConfig.navInput.symbol) ||
        plan.runWindow.startDate !== runConfig.startDate ||
        plan.runWindow.endDate !== runConfig.endDate ||
        plan.navRange.endDate !== runConfig.endDate ||
        plan.navRange.startDate > runConfig.startDate ||
        !plan.priceInputs.some((input) => input.purpose === 'execution') ||
        !plan.priceInputs.some((input) => input.purpose === 'benchmark')
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'NAV 公开准备结果的时间、计划、配置或来源绑定不一致',
        });
      }
    }),
  backtestNavPreparationBlockedResultV3Schema,
]);
export type BacktestNavPreparationResultV3 = z.infer<typeof backtestNavPreparationResultV3Schema>;
export type BacktestNavPreparationDiagnosticV3 = z.infer<
  typeof backtestNavPreparationDiagnosticV3Schema
>;
