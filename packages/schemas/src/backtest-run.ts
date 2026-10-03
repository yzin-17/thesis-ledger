import { z } from 'zod';
import { nonNegativeDecimalStringSchema } from './monetary-values.js';
import { backtestCurrencySchema, currencyForMarket } from './backtest-values.js';
import { type BacktestStrategy } from './backtest-strategy.js';
import { backtestResultSchemaV3 } from './backtest-result.js';
import { backtestPreflightRevisionStampV3Schema } from './backtest-preflight-context-v3.js';
import {
  executionModelRunIssues,
  executionModelAccountingIssuesV3,
  backtestExecutionModelSchemaV3,
  executionModelDisclosureSchema,
} from './backtest-execution-model.js';
import { executionPriceProtocolSchema } from './market-price-protocol.js';
import { backtestPriceInputBindingsSchemaV3 } from './backtest-price-input-bindings.js';
import { marketFrozenWindowRefV3Schema } from './market-frozen-window.js';
import { backtestSnapshotManifestV3Schema } from './backtest-data.js';
const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message });
const decimalIsNonNegative = (value: string) => !value.startsWith('-');
const decimalIsPositive = (value: string) => /[1-9]/.test(value);
export const portfolioValuationPolicySchema = z
  .object({
    baseTimezone: z.string().trim().min(1),
    dailyValuationTime: z.string().regex(/^\d{2}:\d{2}$/),
    pricePolicy: z.literal('latestAvailable'),
    fxPolicy: z.literal('latestAvailable'),
  })
  .strict();
export type PortfolioValuationPolicy = z.infer<typeof portfolioValuationPolicySchema>;

const initialCashSchema = z
  .object({
    CNY: nonNegativeDecimalStringSchema.optional(),
    HKD: nonNegativeDecimalStringSchema.optional(),
    USD: nonNegativeDecimalStringSchema.optional(),
  })
  .strict();

const runConfigFields = {
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  dataAsOf: z.iso.datetime({ offset: true }),
  baseCurrency: backtestCurrencySchema,
  initialCash: initialCashSchema,
  valuationPolicy: portfolioValuationPolicySchema,
};

export const validateRunConfig = (
  value: {
    startDate: string;
    endDate: string;
    dataAsOf: string;
    initialCash: {
      CNY?: string | undefined;
      HKD?: string | undefined;
      USD?: string | undefined;
    };
    executionModel?: z.infer<typeof backtestExecutionModelSchemaV3> | undefined;
  },
  ctx: z.RefinementCtx,
) => {
  if (value.executionModel) {
    for (const error of executionModelRunIssues(value.executionModel, value)) {
      issue(ctx, ['executionModel', ...error.path], error.message);
    }
  }
  if (value.startDate > value.endDate) issue(ctx, ['endDate'], 'startDate 必须早于或等于 endDate');
  if (
    !Object.values(value.initialCash).some(
      (amount) => amount !== undefined && decimalIsNonNegative(amount),
    )
  ) {
    issue(ctx, ['initialCash'], '至少提供一种初始现金');
  }
};

/** 当前配置冻结明确的价格坐标与历史可见性语义。 */
export const runConfigSchemaV3 = z
  .strictObject({
    schemaVersion: z.literal('3'),
    ...runConfigFields,
    executionModel: backtestExecutionModelSchemaV3.optional(),
    executionPriceProtocol: executionPriceProtocolSchema,
    priceInputBindings: backtestPriceInputBindingsSchemaV3.optional(),
    frozenExecutionWindow: marketFrozenWindowRefV3Schema.optional(),
    frozenWarmupBudgetSessions: z.number().int().min(0).max(504).optional(),
  })
  .superRefine((value, context) => {
    validateRunConfig(value, context);
    if (value.frozenWarmupBudgetSessions !== undefined && !value.frozenExecutionWindow) {
      issue(context, ['frozenWarmupBudgetSessions'], '预热预算必须与冻结行情窗口一起保存');
    }
    for (const error of executionModelAccountingIssuesV3(
      value.executionModel,
      value,
      value.executionPriceProtocol.accountingBasis,
    )) {
      issue(context, ['executionModel', ...error.path.slice(1)], error.message);
    }
  });
export type RunConfigV3 = z.infer<typeof runConfigSchemaV3>;

/** 当前 Run 创建入口。 */
export const backtestRunCreateSchemaV3 = z.strictObject({
  contractVersion: z.literal(3),
  preparationStamp: backtestPreflightRevisionStampV3Schema,
  strategyVersionId: z.uuid(),
  runConfig: runConfigSchemaV3,
  idempotencyKey: z.string().trim().min(1).max(200),
});
export type BacktestRunCreateV3 = z.infer<typeof backtestRunCreateSchemaV3>;

export const backtestRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type BacktestRunStatus = z.infer<typeof backtestRunStatusSchema>;

export const backtestRunStageSchema = z.enum([
  'queued',
  'snapshot-finalized',
  'running',
  'persisting-result',
  'succeeded',
  'failed',
  'cancelled',
]);
export type BacktestRunStage = z.infer<typeof backtestRunStageSchema>;

export const backtestRunResponseSchemaV3 = z
  .object({
    id: z.string().trim().min(1),
    strategyVersionId: z.string().trim().min(1),
    mode: z.literal('V3'),
    status: backtestRunStatusSchema,
    stage: backtestRunStageSchema.nullable().optional(),
    snapshotId: z.string().trim().min(1).nullable().optional(),
    errorCode: z.string().trim().min(1).nullable().optional(),
    errorSummary: z.string().nullable().optional(),
    executionModelDisclosure: executionModelDisclosureSchema.optional(),
    runConfig: runConfigSchemaV3.nullable().optional(),
    snapshotManifest: backtestSnapshotManifestV3Schema.nullable().optional(),
    result: z
      .lazy(() => backtestResultSchemaV3)
      .nullable()
      .optional(),
  })
  .passthrough();
export type BacktestRunResponseV3 = z.infer<typeof backtestRunResponseSchemaV3>;

export interface StrategyRunConfigValidationError {
  code: 'INSUFFICIENT_CASH' | 'INVALID_SCHEMA';
  message: string;
  path: (string | number)[];
}

export interface StrategyRunConfigValidationResult {
  valid: boolean;
  errors: StrategyRunConfigValidationError[];
}

export const validateStrategyInitialCash = (
  strategy: BacktestStrategy,
  runConfig: Pick<RunConfigV3, 'initialCash'>,
): StrategyRunConfigValidationResult => {
  const executionCurrency = currencyForMarket[strategy.executionInstrument.market];
  const amount = runConfig.initialCash[executionCurrency];
  if (amount !== undefined && decimalIsPositive(amount)) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: [
      {
        code: 'INSUFFICIENT_CASH',
        path: ['runConfig', 'initialCash', executionCurrency],
        message: `执行标的需要 ${executionCurrency} 的正数已结算初始现金`,
      },
    ],
  };
};

/**
 * Cross-contract validation kept separate from the Run create DTO. The Server
 * can call this after resolving an immutable StrategyVersion and parsing a
 * RunConfig, without making either public schema depend on the other.
 */
export const validateStrategyRunConfig = (
  strategy: BacktestStrategy,
  runConfig: RunConfigV3,
): StrategyRunConfigValidationResult => {
  const cash = validateStrategyInitialCash(strategy, runConfig);
  const errors: StrategyRunConfigValidationError[] = runConfig.executionModel
    ? executionModelRunIssues(
        runConfig.executionModel,
        runConfig,
        strategy.executionInstrument,
      ).map((error) => ({
        code: 'INVALID_SCHEMA',
        path: ['runConfig', 'executionModel', ...error.path],
        message: error.message,
      }))
    : [];
  return {
    valid: errors.length === 0 && cash.valid,
    errors: [...errors, ...cash.errors],
  };
};
