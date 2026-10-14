import { z } from 'zod';
import { lifecycleWarmupPolicyV3 } from './backtest-lifecycle-preparation-v3.js';
import { runConfigSchemaV3, validateRunConfig } from './backtest-contract.js';
import {
  backtestExecutionModelSchemaV3,
  executionModelAccountingIssuesV3,
  executionModelRunIssues,
} from './backtest-execution-model.js';
import {
  accountingBasisSchema,
  historyInputSchema,
  priceAdjustmentSchema,
} from './market-price-protocol.js';
import {
  backtestPreflightDiagnosticV3Schema,
  backtestPreflightResultV3Schema,
} from './backtest-preflight-v3.js';
import { backtestSnapshotActualSourceV3Schema } from './backtest-data.js';
import { marketAnnouncementPreparationSchema } from './market-announcement-preparation.js';
import { backtestKnownCashResearchPolicyV3Schema } from './backtest-known-cash-research-policy-v3.js';
import { marketFrozenWindowRefV3Schema } from './market-frozen-window.js';

const preparationConfigSchema = z
  .strictObject(runConfigSchemaV3.shape)
  .omit({
    schemaVersion: true,
    executionPriceProtocol: true,
    priceInputBindings: true,
    frozenExecutionWindow: true,
    frozenWarmupBudgetSessions: true,
    frozenPriceWarmupPolicy: true,
    lifecyclePreparation: true,
    knownCashPreparation: true,
  })
  .extend({ executionModel: backtestExecutionModelSchemaV3 })
  .superRefine((config, context) => {
    validateRunConfig({ ...config, executionModel: undefined }, context);
    for (const issue of executionModelRunIssues(config.executionModel, config)) {
      context.addIssue({
        code: 'custom',
        path: ['executionModel', ...issue.path],
        message: issue.message,
      });
    }
  });

/** User intent only; source basis/revision and signal bindings belong to Server resolution. */
const preparationIntentFields = z.strictObject({
  contractVersion: z.literal(3),
  requestId: z.string().trim().min(1).max(200),
  runConfig: preparationConfigSchema,
  adjustment: priceAdjustmentSchema,
  accountingBasis: accountingBasisSchema,
  history: historyInputSchema,
  cashEventResearch: z.literal('ex-date-entitlement-payment-date-cash-v1').optional(),
  knownCashResearch: backtestKnownCashResearchPolicyV3Schema.optional(),
  reuseResearchData: z
    .strictObject({
      executionWindow: marketFrozenWindowRefV3Schema,
      cashPreparationHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
  marketRuleResearch: z.literal('raw-prices-no-corporate-actions-v1').optional(),
  lifecycleResearch: z.literal(lifecycleWarmupPolicyV3).optional(),
  warmupBudgetSessions: z.number().int().min(0).max(504).optional(),
  freezeTimePolicy: z.enum(['requested-time', 'after-acquisition']).optional(),
});

const validatePreparationIntent = (
  request: z.infer<typeof preparationIntentFields>,
  context: z.RefinementCtx,
) => {
  const raw = request.accountingBasis === 'raw-events';
  if (
    request.reuseResearchData &&
    request.knownCashResearch?.entitlement !== 'cn-etf-record-close-holdings-v2'
  )
    context.addIssue({
      code: 'custom',
      path: ['reuseResearchData'],
      message: '数据复用仅接受已有v2现金原包的新准备，不转换旧冻结版本',
    });
  if (
    request.knownCashResearch &&
    (!request.cashEventResearch ||
      !raw ||
      request.adjustment !== 'none' ||
      request.history.basis !== 'fixed-provider-snapshot' ||
      request.runConfig.executionModel.scope.market !== 'CN' ||
      request.runConfig.executionModel.scope.instrumentType !== 'ETF' ||
      request.runConfig.executionModel.scope.currency !== 'CNY' ||
      request.runConfig.baseCurrency !== 'CNY')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['knownCashResearch'],
      message: '已知方案研究需要全部显式假设、境内ETF/CNY原价固定快照和现金时序',
    });
  }
  if (
    request.lifecycleResearch &&
    (request.history.basis !== 'fixed-provider-snapshot' ||
      request.runConfig.executionModel.scope.market !== 'CN' ||
      request.runConfig.executionModel.scope.instrumentType !== 'STOCK')
  )
    context.addIssue({
      code: 'custom',
      path: ['lifecycleResearch'],
      message: '生命周期预热研究仅支持固定来源境内股票',
    });
  if (
    request.marketRuleResearch &&
    (!raw ||
      request.cashEventResearch ||
      request.history.basis !== 'fixed-provider-snapshot' ||
      request.runConfig.executionModel.scope.instrumentType !== 'STOCK')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['marketRuleResearch'],
      message: '规则研究需要股票原价、固定快照与显式模型，并与现金研究互斥',
    });
  }
  if (
    request.cashEventResearch &&
    (!raw ||
      request.history.basis !== 'fixed-provider-snapshot' ||
      request.runConfig.executionModel.scope.market !== 'CN' ||
      request.runConfig.executionModel.scope.instrumentType !== 'ETF')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['cashEventResearch'],
      message: '现金分红研究需要境内ETF原始价格、固定快照和显式模型',
    });
  }
  if (
    request.freezeTimePolicy === 'after-acquisition' &&
    request.history.basis !== 'fixed-provider-snapshot'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['freezeTimePolicy'],
      message: '取价完成时冻结仅适用于固定快照研究',
    });
  }
  if (raw !== (request.adjustment === 'none')) {
    context.addIssue({
      code: 'custom',
      path: ['adjustment'],
      message: '价格口径与显式记账方式不兼容',
    });
  }
  for (const issue of executionModelAccountingIssuesV3(
    request.runConfig.executionModel,
    request.runConfig,
    request.accountingBasis,
  )) {
    context.addIssue({
      code: 'custom',
      path: ['runConfig', ...issue.path],
      message: issue.message,
    });
  }
};

export const backtestRunPreparationIntentV3Schema =
  preparationIntentFields.superRefine(validatePreparationIntent);
export type BacktestRunPreparationIntentV3 = z.infer<typeof backtestRunPreparationIntentV3Schema>;
export const backtestRunPreparationRequestV3Schema = preparationIntentFields
  .extend({ strategyVersionId: z.uuid() })
  .superRefine(validatePreparationIntent);
export type BacktestRunPreparationRequestV3 = z.infer<typeof backtestRunPreparationRequestV3Schema>;

const responseBase = {
  contractVersion: z.literal(3),
  requestId: z.string().trim().min(1),
  checkedAt: z.iso.datetime({ offset: true }),
  scope: z.literal('execution-window'),
};

export const backtestRunPreparationTerminalResultV3Schema = z.discriminatedUnion('status', [
  z
    .strictObject({
      ...responseBase,
      status: z.literal('prepared'),
      runConfig: runConfigSchemaV3,
      actualSource: backtestSnapshotActualSourceV3Schema,
      executionPreflight: backtestPreflightResultV3Schema,
      announcementPreparation: marketAnnouncementPreparationSchema.optional(),
    })
    .superRefine((result, context) => {
      if (result.executionPreflight.status !== 'ready') {
        context.addIssue({
          code: 'custom',
          path: ['executionPreflight'],
          message: '准备成功必须通过执行窗口预检',
        });
      }
      if (!result.runConfig.priceInputBindings || !result.runConfig.executionModel) {
        context.addIssue({
          code: 'custom',
          path: ['runConfig'],
          message: '准备结果必须包含显式模型与完整输入绑定',
        });
      }
      if (result.actualSource.purpose !== 'execution') {
        context.addIssue({
          code: 'custom',
          path: ['actualSource'],
          message: '准备结果必须披露实际执行来源',
        });
      }
    }),
  z
    .strictObject({
      ...responseBase,
      status: z.literal('blocked'),
      diagnostics: z.array(backtestPreflightDiagnosticV3Schema).min(1),
    })
    .superRefine((result, context) => {
      if (!result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        context.addIssue({
          code: 'custom',
          path: ['diagnostics'],
          message: '阻断结果必须包含错误诊断',
        });
      }
    }),
]);
export const backtestRunPreparationResultV3Schema = z.discriminatedUnion('status', [
  ...backtestRunPreparationTerminalResultV3Schema.options,
  z
    .strictObject({
      ...responseBase,
      status: z.literal('preparing'),
      announcementPreparation: marketAnnouncementPreparationSchema,
    })
    .refine((value) => value.announcementPreparation.status === 'preparing', {
      message: '准备中的响应必须包含未完成的公告任务',
    }),
]);
export type BacktestRunPreparationResultV3 = z.infer<typeof backtestRunPreparationResultV3Schema>;
export type BacktestRunPreparationTerminalResultV3 = z.infer<
  typeof backtestRunPreparationTerminalResultV3Schema
>;
