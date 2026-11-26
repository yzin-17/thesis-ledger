import { z } from 'zod';
import { currencySchema, fxRateSchema, instrumentDirectorySchema } from './market.js';

export const apiErrorResponseSchema = z
  .object({
    error: z.string(),
    errorCode: z.string().optional(),
    message: z.string().optional(),
    fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    accountId: z.string().trim().min(1).optional(),
    currentLedgerRevision: z.string().regex(/^\d+$/).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const portfolioModeSchema = z.enum(['actual', 'shadow']);

export const portfolioPositionResponseSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    symbol: z.string().min(1),
    quantity: z.number().finite(),
    costPrice: z.number().finite(),
    marketPrice: z.number().finite().nullable(),
    previousClose: z.number().finite().nonnegative().nullable().optional(),
    marketValue: z.number().finite().nullable(),
    costValue: z.number().finite(),
    pnl: z.number().finite().nullable(),
    pnlRatio: z.number().finite().nullable(),
    dailyPnl: z.number().finite().nullable().optional(),
    dailyReturn: z.number().finite().nullable().optional(),
    baseDailyPnl: z.number().finite().nullable().optional(),
    stale: z.boolean(),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
    freshness: z.string().optional(),
    navDate: z.iso.datetime({ offset: true }).optional(),
    availabilityReason: z.enum(['disabled', 'not_selected', 'not_eligible', 'unavailable']).optional(),
    error: z.string().optional(),
    asset: z
      .object({
        symbol: z.string().optional(),
        name: z.string().optional(),
        assetType: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const portfolioValuationResponseSchema = z.object({
  positions: z.array(portfolioPositionResponseSchema),
  cashValue: z.number().finite(),
  cashByAccount: z.array(
    z
      .object({
        accountId: z.uuid(),
        amount: z.number().finite(),
        currency: currencySchema.optional(),
        nativeCurrency: currencySchema.optional(),
        nativeAmount: z.number().finite().nullable().optional(),
        partial: z.boolean().optional(),
        missingCurrencies: z.array(currencySchema).optional(),
      })
      .passthrough(),
  ),
  cashByCurrency: z
    .array(
      z.object({
        currency: currencySchema,
        amount: z.number().finite(),
        convertedAmount: z.number().finite().nullable(),
      }),
    )
    .optional(),
  totalCost: z.number().finite(),
  totalMarketValue: z.number().finite(),
  totalPnl: z.number().finite(),
  unrealizedPnl: z.number().finite().nullable(),
  unrealizedPnlRatio: z.number().finite().nullable(),
  realizedPnl: z.number().finite().nullable(),
  realizedPnlRatio: z.number().finite().nullable(),
  cumulativePnl: z.number().finite().nullable(),
  cumulativePnlRatio: z.number().finite().nullable(),
  dailyChange: z
    .object({
      pnl: z.number().finite().nullable(),
      returnRate: z.number().finite().nullable(),
      partial: z.boolean(),
      missingSymbols: z.array(z.string()),
      basis: z.literal('PREVIOUS_CLOSE_CURRENT_HOLDINGS'),
    })
    .optional(),
  partial: z.boolean(),
  mode: portfolioModeSchema,
  baseCurrency: currencySchema.optional(),
  fx: z
    .object({
      version: z.literal(1).optional(),
      evidenceVersion: z.string().min(1).optional(),
      enabled: z.boolean(),
      status: z.enum(['disabled', 'not_needed', 'ready', 'stale', 'blocked']),
      baseCurrency: currencySchema.optional(),
      asOf: z.iso.date().optional(),
      fxAsOf: z.iso.date().optional(),
      estimated: z.boolean().optional(),
      conversionMode: z.enum(['current-rate', 'historical-rate']).optional(),
      stale: z.boolean().optional(),
      fxStale: z.boolean().optional(),
      missingCurrencies: z.array(currencySchema),
      rates: z.array(fxRateSchema),
    })
    .passthrough()
    .optional(),
  dataQuality: z
    .object({
      partial: z.boolean(),
      missingSymbols: z.array(z.string()),
      missingCurrencies: z.array(currencySchema).optional(),
    })
    .passthrough()
    .optional(),
  valuedAt: z.iso.datetime({ offset: true }),
});

export const riskEventResponseSchema = z
  .object({
    id: z.uuid(),
    ruleId: z.uuid(),
    ruleVersion: z.number().int().positive(),
    triggered: z.boolean(),
    severity: z.string().min(1),
    message: z.string(),
    mode: portfolioModeSchema,
    accountId: z.uuid().nullable(),
    symbol: z.string().nullable(),
    triggerValue: z.union([z.number(), z.string()]).nullable().optional(),
    threshold: z.union([z.number(), z.string()]).nullable().optional(),
    marketTime: z.iso.datetime({ offset: true }).nullable(),
    scanId: z.uuid().nullable().optional(),
    context: z.record(z.string(), z.unknown()),
    evaluatedAt: z.iso.datetime({ offset: true }),
  })
  .passthrough();

export const riskEventsResponseSchema = z.array(riskEventResponseSchema);

export const performanceSummaryResponseSchema = z
  .object({
    accountId: z.uuid().nullable(),
    snapshots: z.array(z.unknown()),
    ttwror: z.number().finite().nullable(),
    ttwrorReason: z.string().nullable().optional(),
    xirr: z.number().finite().nullable(),
    xirrReason: z.string().nullable().optional(),
  })
  .passthrough();

export const instrumentSearchResultSchema = z
  .object({
    id: z.uuid(),
    instrumentType: z.string().min(1),
    market: z.string().min(1),
    canonicalCode: z.string().min(1),
    displayName: z.string().min(1),
    symbol: z.string().min(1),
    confirmable: z.boolean(),
    confirmed: z.boolean().optional(),
    disabledReason: z.string().nullable(),
    generation: z.number().int().nonnegative(),
    active: z.boolean(),
  })
  .passthrough();

export const instrumentLocatorSchema = instrumentSearchResultSchema.pick({
  symbol: true, instrumentType: true,
}).strict();
export const instrumentLocatorResultSchema = z.object({instrumentId: z.uuid().nullable()}).strict();
export const instrumentSearchResponseSchema = z.array(instrumentSearchResultSchema);

export const dataQualityIssueInputSchema = z.object({
  capability: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  symbol: z.string().trim().min(1).optional(),
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()),
});

export const notificationMessageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

export const automationEnabledInputSchema = z.object({ enabled: z.boolean() });
export const automationPositionSchema = z.object({
  symbol: z.string().min(1),
  quantity: z.number().finite(),
  marketValue: z.number().finite().optional(),
});
export const automationEventSchema = z.object({
  symbol: z.string().min(1),
  kind: z.string().min(1),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  provider: z.string().optional(),
});
export const automationPreMarketEventsInputSchema = z.object({
  positions: z.array(automationPositionSchema),
  events: z.array(automationEventSchema),
});
export const automationRiskPreviewInputSchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  contexts: z.array(z.unknown()),
});
export const automationDailyRiskSummaryInputSchema = z.object({
  events: z.array(
    z.object({ severity: z.string(), triggered: z.boolean(), status: z.string().optional() }),
  ),
});
export const automationDigestInputSchema = z.object({
  date: z.string().min(1),
  events: z.array(automationEventSchema),
  risk: z.object({
    triggered: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    recovered: z.number().int().nonnegative(),
    bySeverity: z.record(z.string(), z.number().int().nonnegative()),
  }),
  attention: z.array(z.string()),
});
export const automationDailyReportInputSchema = z.object({
  date: z.string().min(1),
  portfolio: z.object({
    totalValue: z.number().finite(),
    dailyReturn: z.number().finite().optional(),
    cumulativeReturn: z.number().finite().optional(),
  }),
  benchmark: z.object({ return: z.number().finite() }).optional(),
  risk: automationDigestInputSchema.shape.risk,
  events: z.array(automationEventSchema),
  aiSummary: z.object({ conclusion: z.string(), citations: z.array(z.unknown()) }).optional(),
});
export const automationOpeningScanInputSchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  quotes: z.array(
    z.object({
      symbol: z.string().min(1),
      price: z.number().finite(),
      previousClose: z.number().finite(),
    }),
  ),
});
export const automationWeeklyPerformanceInputSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  snapshots: z.array(
    z.object({ value: z.number().finite(), drawdown: z.number().finite().optional() }),
  ),
  trades: z.array(z.unknown()),
});
export const automationWeeklyStrategyInputSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  strategySignals: z.array(z.unknown()),
  backtestChanges: z.array(z.unknown()),
  executionLinks: z.array(z.unknown()),
});
export const automationCloseSyncInputSchema = z.object({
  symbols: z.array(z.string().min(1)),
  timeframe: z.literal('1d').optional(),
  end: z.iso.datetime({ offset: true }),
});
export const automationCloseSnapshotsInputSchema = z.object({
  accountIds: z.array(z.uuid()),
  capturedAt: z.iso.datetime({ offset: true }),
});
export const automationRiskScanInputSchema = z.object({ contexts: z.array(z.unknown()) });

export const aiRunStartInputSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  context: z.unknown().optional(),
  question: z.string().trim().min(1).max(2_000).optional(),
  templateId: z.string().trim().min(1).optional(),
  retryOfRunId: z.uuid().optional(),
  modelMetadata: z.unknown().optional(),
});
export const aiCheckpointInputSchema = z.record(z.string(), z.unknown());
export const aiRunFinishInputSchema = z.object({
  result: z.unknown(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cost: z.number().finite().nonnegative(),
  }),
});
export const aiToolCallInputSchema = z.object({
  tool: z.string().trim().min(1),
  permission: z.enum(['read', 'research', 'write']),
  status: z.enum(['ok', 'unavailable', 'denied']),
  inputSummary: z.string(),
  outputSummary: z.string().optional(),
  provider: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  marketTime: z.iso.datetime({ offset: true }).optional(),
  availableAt: z.iso.datetime({ offset: true }).optional(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
});
export const aiDecisionLogInputSchema = z.object({
  symbol: z.string().optional(),
  accountId: z.uuid().optional(),
  question: z.string().trim().min(1),
  assumptions: z.unknown(),
  conclusion: z.unknown(),
  context: z.unknown().optional(),
  provenance: z.unknown().optional(),
});

export const journalEntryInputSchema = z.object({
  entryType: z.enum(['trade', 'review', 'note', 'risk']).optional(),
  accountId: z.uuid().optional(),
  ledgerEventId: z.uuid().optional(),
  tradePlanId: z.uuid().optional(),
  riskEventId: z.uuid().optional(),
  strategyVersionId: z.uuid().optional(),
  symbol: z.string().optional(),
  side: z.enum(['buy', 'sell', 'review']).optional(),
  reason: z.string().trim().min(1),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  thesis: z.string().optional(),
  catalyst: z.string().optional(),
  risk: z.string().optional(),
  exitReason: z.string().optional(),
  emotion: z.string().optional(),
  notes: z.string().optional(),
});
export const journalEntryUpdateSchema = journalEntryInputSchema.partial();
export const tradePlanInputSchema = z.object({
  accountId: z.uuid().optional(),
  tradeId: z.string().trim().min(1).optional(),
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']).optional(),
  plannedEntry: z.number().finite().optional(),
  plannedExit: z.number().finite().optional(),
  plannedEntryAt: z.iso.datetime({ offset: true }).optional(),
  plannedExitAt: z.iso.datetime({ offset: true }).optional(),
  stopLoss: z.number().finite().optional(),
  takeProfit: z.number().finite().optional(),
  targetWeight: z.number().finite().optional(),
  expectedHoldingDays: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  thesis: z.string().optional(),
  status: z.enum(['active', 'executed', 'cancelled']).optional(),
});
export type PortfolioValuationResponse = z.infer<typeof portfolioValuationResponseSchema>;
export type RiskEventResponse = z.infer<typeof riskEventResponseSchema>;
export type PerformanceSummaryResponse = z.infer<typeof performanceSummaryResponseSchema>;
export type InstrumentSearchResult = z.infer<typeof instrumentSearchResultSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
