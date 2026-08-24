import { z } from 'zod';

const riskRuleFields = z.object({
  kind: z.enum([
    'fixed-stop',
    'cost-stop',
    'take-profit',
    'price-above',
    'price-below',
    'position-concentration',
    'trailing-stop',
    'drawdown',
    'ma',
    'rsi',
    'macd',
    'atr',
    'volume',
    'chip-peak',
    'chip-ratio',
    'chip-migration',
    'sector-concentration',
    'asset-concentration',
    'volatility-exposure',
    'correlation',
  ]),
  scope: z.enum(['security', 'account', 'portfolio']),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  threshold: z.number().finite(),
  enabled: z.boolean().default(true),
  symbol: z.string().optional(),
  accountId: z.uuid().optional(),
  sourcePlanId: z.uuid().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  effectiveAt: z.iso.datetime({ offset: true }).optional(),
});

export const riskRuleKindsRequiringAccount: ReadonlySet<string> = new Set([
  'cost-stop',
  'take-profit',
  'trailing-stop',
]);

export const requiresRiskRuleAccount = (kind: string, scope: string) =>
  scope === 'security' && riskRuleKindsRequiringAccount.has(kind);

const validateScope = (value: z.infer<typeof riskRuleFields>, context: z.RefinementCtx) => {
  if (value.scope === 'security' && !value.symbol)
    context.addIssue({ code: 'custom', path: ['symbol'], message: 'security 规则必须指定 symbol' });
  if (requiresRiskRuleAccount(value.kind, value.scope) && !value.accountId)
    context.addIssue({
      code: 'custom',
      path: ['accountId'],
      message: `${value.kind} 规则必须绑定 accountId`,
    });
  if (value.scope === 'account' && !value.accountId)
    context.addIssue({
      code: 'custom',
      path: ['accountId'],
      message: 'account 规则必须指定 accountId',
    });
  if (value.scope === 'portfolio' && (value.symbol || value.accountId))
    context.addIssue({
      code: 'custom',
      path: ['scope'],
      message: 'portfolio 规则不能指定 symbol 或 accountId',
    });
};

export const riskRuleInputSchema = riskRuleFields.superRefine(validateScope);

// Used only when reading legacy persisted rules that predate account binding.
// New writes must continue to use riskRuleInputSchema.
export const riskRuleStoredSchema = riskRuleFields;

export const riskRuleUpdateSchema = riskRuleFields
  .omit({ kind: true, scope: true, enabled: true })
  .partial()
  .extend({
    kind: riskRuleFields.shape.kind.optional(),
    scope: riskRuleFields.shape.scope.optional(),
    enabled: z.boolean().optional(),
  });

const riskModeSchema = z.enum(['actual', 'shadow']);
const riskDataQualitySchema = z.record(z.string(), z.string()).default({});
const riskPositionSchema = z.object({
  symbol: z.string(),
  weight: z.number().min(0).max(1),
  sector: z.string().optional(),
  assetType: z.string().optional(),
  volatility: z.number().nonnegative().optional(),
});
const riskAggregateFields = {
  mode: riskModeSchema.default('actual'),
  portfolioValues: z.array(z.number()).optional(),
  performance: z.record(z.string(), z.number()).optional(),
  positions: z.array(riskPositionSchema).optional(),
  returns: z.record(z.string(), z.array(z.number())).optional(),
  dataQuality: riskDataQualitySchema,
  marketTime: z.iso.datetime({ offset: true }),
};

export const riskSecurityContextSchema = z.object({
  symbol: z.string(),
  accountId: z.uuid().optional(),
  positionId: z.uuid().optional(),
  mode: riskModeSchema.default('actual'),
  price: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  quantity: z.number().nonnegative().optional(),
  weight: z.number().min(0).max(1).optional(),
  accountWeight: z.number().min(0).max(1).optional(),
  holdingPeak: z.number().positive().optional(),
  positionUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  portfolioValues: z.array(z.number()).optional(),
  indicators: z.record(z.string(), z.number()).optional(),
  chip: z
    .object({
      mainPeak: z.number().positive().optional(),
      profitRatio: z.number().min(0).max(1),
      concentration: z.number().min(0).max(1),
      previousMainPeaks: z.array(z.number()).optional(),
      engineVersion: z.string(),
      calculatedAt: z.iso.datetime({ offset: true }),
    })
    .optional(),
  performance: z.record(z.string(), z.number()).optional(),
  positions: z.array(riskPositionSchema).optional(),
  returns: z.record(z.string(), z.array(z.number())).optional(),
  dataQuality: riskDataQualitySchema,
  marketTime: z.iso.datetime({ offset: true }),
});

export const riskAccountContextSchema = z.object({
  accountId: z.uuid(),
  ...riskAggregateFields,
});

export const riskPortfolioContextSchema = z.object(riskAggregateFields);

export const riskScanEnvelopeSchema = z.object({
  scanId: z.uuid().optional(),
  security: z.array(riskSecurityContextSchema).default([]),
  accounts: z.array(riskAccountContextSchema).default([]),
  portfolio: riskPortfolioContextSchema.optional(),
  allowStale: z.boolean().default(false),
});

// Backward-compatible name for callers that still submit a flat security-context array.
export const riskScanContextSchema = riskSecurityContextSchema;
