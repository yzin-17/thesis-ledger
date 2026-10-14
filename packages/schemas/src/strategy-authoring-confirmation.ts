import { z } from 'zod';
import { assetSymbolRefSchema, backtestTimeframeSchema } from './backtest-values.js';
import {
  sizingRuleSchema,
  riskRuleSchema,
  executionConfigSchema,
  strategyCostModelSchema,
} from './backtest-strategy.js';

// 用户确认的交易约束独立于模型输出；空风险也必须有明确选择。
export const authoringConfirmationSchema = z
  .object({
    instrumentId: z.string().trim().min(1).max(200),
    instrument: assetSymbolRefSchema,
    timeframe: backtestTimeframeSchema,
    entrySummary: z.string().trim().min(1).max(2000),
    exitSummary: z.string().trim().min(1).max(2000),
    sizing: sizingRuleSchema,
    risk: z.array(riskRuleSchema).max(64),
    noExtraRiskConfirmed: z.boolean(),
    execution: executionConfigSchema,
    cost: strategyCostModelSchema,
    periodsAreBarsConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.risk.length === 0 && !value.noExtraRiskConfirmed)
      ctx.addIssue({ code: 'custom', message: '不设置额外风险规则需要明确确认', path: ['risk'] });
  });
export type AuthoringConfirmation = z.infer<typeof authoringConfirmationSchema>;
export const authoringConfirmationDraftSchema = z
  .object({
    instrumentId: z.string().max(200),
    instrument: assetSymbolRefSchema.nullable(),
    timeframe: z.string().max(20),
    entrySummary: z.string().max(2000),
    exitSummary: z.string().max(2000),
    sizingType: z.string().max(40),
    sizingValue: z.string().max(100),
    riskMode: z.string().max(40),
    riskPercent: z.string().max(100),
    riskText: z.string().max(16000),
    executionMode: z.string().max(40),
    commissionRate: z.string().max(100),
    slippageRate: z.string().max(100),
    periodsAreBarsConfirmed: z.boolean(),
    noExtraRiskConfirmed: z.boolean(),
  })
  .strict();
export type AuthoringConfirmationDraft = z.infer<typeof authoringConfirmationDraftSchema>;
