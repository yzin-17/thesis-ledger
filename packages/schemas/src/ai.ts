import { z } from 'zod';

export const aiCitationSchema = z.object({
  toolCallId: z.uuid().optional(),
  tool: z.string(),
  sourceId: z.string(),
  provider: z.string(),
  observedAt: z.iso.datetime({ offset: true }),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
});

export const aiContextSchema = z.object({
  scope: z.enum(['portfolio', 'account', 'position', 'strategy']),
  portfolioId: z.string().optional(),
  accountId: z.string().optional(),
  symbol: z.string().optional(),
  strategyVersionId: z.string().optional(),
});

export const aiResearchContextSchema = aiContextSchema.superRefine((value, context) => {
  const reject = (field: 'portfolioId' | 'accountId' | 'symbol' | 'strategyVersionId') => {
    if (value[field] !== undefined) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${value.scope} 研究不应携带 ${field}`,
      });
    }
  };
  if (value.scope === 'account' && !value.accountId) {
    context.addIssue({
      code: 'custom',
      path: ['accountId'],
      message: '账户研究必须选择具体账户',
    });
  }
  if (value.scope === 'position' && (!value.accountId || !value.symbol)) {
    context.addIssue({
      code: 'custom',
      path: ['symbol'],
      message: '持仓研究必须选择账户和标的',
    });
  }
  if (value.scope === 'strategy' && !value.strategyVersionId) {
    context.addIssue({
      code: 'custom',
      path: ['strategyVersionId'],
      message: '策略研究必须选择具体版本',
    });
  }
  if (value.scope === 'portfolio') {
    reject('accountId');
    reject('symbol');
    reject('strategyVersionId');
  }
  if (value.scope === 'account') {
    reject('portfolioId');
    reject('symbol');
    reject('strategyVersionId');
  }
  if (value.scope === 'position') {
    reject('portfolioId');
    reject('strategyVersionId');
  }
  if (value.scope === 'strategy') {
    reject('portfolioId');
    reject('accountId');
    reject('symbol');
  }
});

export const aiResearchTemplateIdSchema = z.enum([
  'primary-risks',
  'recent-changes',
  'counter-evidence',
  'stress-scenario',
]);

export const aiResearchStartInputSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    context: aiResearchContextSchema,
    templateId: aiResearchTemplateIdSchema.optional(),
    retryOfRunId: z.uuid().optional(),
  })
  .strict();

export const aiToolCallSchema = z.object({
  id: z.uuid().optional(),
  tool: z.string(),
  permission: z.string(),
  status: z.enum(['ok', 'unavailable', 'denied']),
  inputSummary: z.string(),
  outputSummary: z.string().optional(),
  provider: z.string().optional(),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

export const aiRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

export const aiRunCursorSchema = z.string().trim().min(1).max(512);

export const aiRunPageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: aiRunCursorSchema.nullable(),
  hasMore: z.boolean(),
});

export const aiToolCallsPageSchema = z.object({
  items: z.array(aiToolCallSchema),
  nextCursor: aiRunCursorSchema.nullable(),
  hasMore: z.boolean(),
});

export const aiCapabilityStateSchema = z.enum(['available', 'demo', 'unconfigured', 'error']);

export const aiCapabilitySchema = z.object({
  provider: z.string(),
  state: aiCapabilityStateSchema,
  models: z.array(z.string()),
  tools: z.array(z.string()),
  missing: z.array(z.string()),
  impact: z.array(z.string()),
});

export const aiCapabilitiesResponseSchema = z.object({
  canStart: z.boolean(),
  providers: z.array(aiCapabilitySchema),
  checkedAt: z.iso.datetime({ offset: true }),
});

export const aiAnalysisSchema = z.object({
  conclusion: z.string(),
  evidence: z.array(z.object({ claim: z.string(), citations: z.array(aiCitationSchema).min(1) })),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  disclaimer: z.string(),
  context: aiContextSchema.optional(),
  toolCalls: z.array(aiToolCallSchema).optional(),
});
