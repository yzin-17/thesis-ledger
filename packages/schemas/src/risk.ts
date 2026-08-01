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

const validateScope = (value: z.infer<typeof riskRuleFields>, context: z.RefinementCtx) => {
  if (value.scope === 'security' && !value.symbol)
    context.addIssue({ code: 'custom', path: ['symbol'], message: 'security 规则必须指定 symbol' });
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

export const riskRuleUpdateSchema = riskRuleFields
  .omit({ kind: true, scope: true })
  .partial()
  .extend({
    kind: riskRuleFields.shape.kind.optional(),
    scope: riskRuleFields.shape.scope.optional(),
  });

export const riskScanContextSchema = z.object({
  symbol: z.string(),
  accountId: z.uuid().optional(),
  price: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  weight: z.number().min(0).max(1).optional(),
  holdingPeak: z.number().positive().optional(),
  portfolioValues: z.array(z.number()).optional(),
  indicators: z.record(z.string(), z.number()).optional(),
  chip: z
    .object({
      mainPeak: z.number(),
      profitRatio: z.number().min(0).max(1),
      concentration: z.number().min(0).max(1),
      previousMainPeaks: z.array(z.number()).optional(),
      engineVersion: z.string(),
      calculatedAt: z.iso.datetime({ offset: true }),
    })
    .optional(),
  performance: z.record(z.string(), z.number()).optional(),
  positions: z
    .array(
      z.object({
        symbol: z.string(),
        weight: z.number().min(0).max(1),
        sector: z.string().optional(),
        assetType: z.string().optional(),
        volatility: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  returns: z.record(z.string(), z.array(z.number())).optional(),
  dataQuality: z.record(z.string(), z.string()).default({}),
  marketTime: z.iso.datetime({ offset: true }),
});
