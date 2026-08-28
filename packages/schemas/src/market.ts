import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });
const isoCalendarDate = z.iso.date();
const finite = z.number().finite();
const freshnessSchema = z.enum(['live', 'delayed', 'stale', 'unknown']);
export const currencySchema = z.enum(['CNY', 'HKD', 'USD']);
export type CurrencyV1 = z.infer<typeof currencySchema>;

export const provenanceSchema = z.object({
  provider: z.string().min(1),
  sourceUrl: z.url().optional(),
  marketTime: isoDate,
  fetchedAt: isoDate,
  freshness: freshnessSchema,
});

export const fxRateSchemaV1 = z.object({
  fromCurrency: currencySchema,
  toCurrency: currencySchema,
  rate: finite.positive().optional(),
  rateDate: isoCalendarDate.optional(),
  provider: z.string().min(1).optional(),
  fetchedAt: isoDate.optional(),
  freshness: z.enum(['live', 'delayed', 'stale', 'unavailable']),
  stale: z.boolean(),
  ageDays: z.number().int().nonnegative().nullable(),
  available: z.boolean(),
});

export const fxRatesResponseSchemaV1 = z.object({
  version: z.literal(1),
  baseCurrency: currencySchema,
  asOf: isoCalendarDate,
  fetchedAt: isoDate,
  maxAgeDays: z.number().int().nonnegative(),
  rates: z.array(fxRateSchemaV1),
});
export type FxRateV1 = z.infer<typeof fxRateSchemaV1>;
export type FxRatesResponseV1 = z.infer<typeof fxRatesResponseSchemaV1>;

export const quoteSchemaV1 = z
  .object({
    version: z.literal(1),
    symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
    open: finite.nonnegative(),
    high: finite.nonnegative(),
    low: finite.nonnegative(),
    price: finite.nonnegative(),
    previousClose: finite.nonnegative(),
    volume: finite.nonnegative(),
    amount: finite.nonnegative(),
    stale: z.boolean(),
    fallbackUsed: z.boolean().optional(),
    servedFromCache: z.boolean().optional(),
  })
  .merge(provenanceSchema)
  .refine(
    (quote) => quote.high >= Math.max(quote.open, quote.low, quote.price),
    '最高价低于其他价格',
  )
  .refine(
    (quote) => quote.low <= Math.min(quote.open, quote.high, quote.price),
    '最低价高于其他价格',
  );

export const barSchemaV1 = z
  .object({
    version: z.literal(1),
    symbol: z.string().min(1),
    timeframe: z.enum(['1m', '1d']),
    timestamp: isoDate,
    open: finite.nonnegative(),
    high: finite.nonnegative(),
    low: finite.nonnegative(),
    close: finite.nonnegative(),
    volume: finite.nonnegative(),
    amount: finite.nonnegative(),
    provider: z.string().min(1),
    fetchedAt: isoDate.default(() => new Date().toISOString()),
    freshness: freshnessSchema.default('unknown'),
    fallbackUsed: z.boolean().default(false),
    servedFromCache: z.boolean().default(false),
  })
  .refine((bar) => bar.high >= Math.max(bar.open, bar.close, bar.low), 'OHLC 最高价非法')
  .refine((bar) => bar.low <= Math.min(bar.open, bar.close, bar.high), 'OHLC 最低价非法');

export const barsSchemaV1 = z.array(barSchemaV1).superRefine((bars, context) => {
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index - 1]!.timestamp >= bars[index]!.timestamp) {
      context.addIssue({
        code: 'custom',
        message: 'Bar 必须按时间升序且时间唯一',
        path: [index, 'timestamp'],
      });
    }
  }
});

export const indicatorSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  name: z.enum(['MA', 'MACD', 'RSI', 'ATR']),
  parameters: z.record(z.string(), z.number()),
  timeframe: z.enum(['1m', '1d']),
  marketTime: isoDate,
  calculatedAt: isoDate,
  values: z.record(z.string(), z.union([z.number(), z.array(z.number())])),
  provider: z.string().min(1),
  fallbackUsed: z.boolean().optional(),
  engineVersion: z.string().min(1),
});

export const chipDistributionSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().min(1),
  buckets: z
    .array(z.object({ price: finite.nonnegative(), weight: finite.min(0).max(1) }))
    .min(1)
    .optional(),
  averageCost: finite.nonnegative(),
  mainPeak: finite.nonnegative().optional(),
  profitRatio: finite.min(0).max(1),
  range70: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  range90: z.tuple([finite.nonnegative(), finite.nonnegative()]),
  concentration: finite.min(0).max(1),
  provider: z.string().min(1),
  fallbackUsed: z.boolean().optional(),
  engineVersion: z.string().min(1),
  calculatedAt: isoDate,
});

export const fundNavSchemaV1 = z.object({
  version: z.literal(1),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  unitNav: finite.nonnegative(),
  navDate: isoDate,
  provider: z.string().min(1),
  fetchedAt: isoDate,
  freshness: z.enum(['delayed', 'stale', 'unavailable']),
  fallbackUsed: z.boolean().optional(),
  servedFromCache: z.boolean().optional(),
});

export const fundNavHistorySchemaV1 = z.array(fundNavSchemaV1).superRefine((points, context) => {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1]!.navDate >= points[index]!.navDate) {
      context.addIssue({
        code: 'custom',
        message: '基金净值历史必须按时间升序且日期唯一',
        path: [index, 'navDate'],
      });
    }
  }
});

export const controlEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  requestId: z.string().min(1),
});

export const providerRouteMatrixSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.string())),
);

export const desiredProviderPolicySchema = controlEnvelopeSchema.extend({
  revision: z.number().int().positive(),
  enabled: z.boolean(),
  routes: providerRouteMatrixSchema,
});

export const providerManifestSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  version: z.number().int().positive(),
  capabilities: z.record(z.string(), z.array(z.string())),
  configured: z.boolean(),
  enabled: z.boolean(),
  credentialConfigured: z.boolean(),
  requiresCredential: z.boolean().optional(),
  updatedAt: isoDate.nullable().optional(),
});

export const effectiveProviderPolicySchema = z.object({
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  revision: z.number().int().nonnegative(),
  sourceDesiredRevision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  routes: providerRouteMatrixSchema,
  routeStatus: z.record(z.string(), z.record(z.string(), z.unknown())),
  appliedAt: isoDate,
});

export const catalogItemSchema = z.object({
  canonicalCode: z.string().min(1),
  instrumentType: z.string().min(1),
  market: z.string().min(1),
  displayName: z.string().min(1),
});

export const catalogSnapshotSchema = z.object({
  contractVersion: z.literal(1),
  generation: z.number().int().positive(),
  checksum: z.string().min(1),
  cursor: z.string().min(1),
  complete: z.boolean(),
  items: z.array(catalogItemSchema),
});
export const catalogDeltaSchema = catalogSnapshotSchema.extend({
  fromCursor: z.string().min(1),
  deleted: z.array(
    catalogItemSchema.pick({ canonicalCode: true, instrumentType: true, market: true }),
  ),
  requiresFullSnapshot: z.boolean().optional(),
});

export const marketDetailCapabilitySchema = z.enum([
  'quote',
  'bars',
  'indicator:MA',
  'indicator:MACD',
  'indicator:RSI',
  'chip',
  'fund-nav',
  'fund-nav-history',
]);

export const marketDetailRequestSchema = z.object({
  symbol: z.string().min(1),
  include: z.array(marketDetailCapabilitySchema).min(1).optional(),
  barsLimit: z.number().int().min(1).max(90).optional(),
  navLimit: z.number().int().min(1).max(90).optional(),
  refresh: z.boolean().optional(),
});

export const marketDetailAssetTypeSchema = z.enum(['STOCK', 'ETF', 'MUTUAL_FUND', 'UNKNOWN']);

export const marketDetailSectionStatusSchema = z.enum([
  'ready',
  'stale',
  'empty',
  'unsupported',
  'unavailable',
]);

export const marketDetailDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  diagnosticId: z.string().min(1),
  requestId: z.string().min(1).optional(),
});

const marketDetailDataSchemaByCapability = {
  quote: quoteSchemaV1,
  bars: barsSchemaV1,
  'indicator:MA': indicatorSchemaV1.extend({ name: z.literal('MA') }),
  'indicator:MACD': indicatorSchemaV1.extend({ name: z.literal('MACD') }),
  'indicator:RSI': indicatorSchemaV1.extend({ name: z.literal('RSI') }),
  chip: chipDistributionSchemaV1,
  'fund-nav': fundNavSchemaV1,
  'fund-nav-history': fundNavHistorySchemaV1,
} as const;

const marketDetailSectionBaseSchema = z.object({
  capability: marketDetailCapabilitySchema,
  status: marketDetailSectionStatusSchema,
  data: z.unknown().optional(),
  error: marketDetailDiagnosticSchema.optional(),
});

const marketDetailSectionSchemaImplementation = marketDetailSectionBaseSchema.superRefine(
  (section, context) => {
    if (section.status === 'ready' || section.status === 'stale') {
      const result = marketDetailDataSchemaByCapability[section.capability].safeParse(section.data);
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          message: 'ready/stale 分段必须携带对应能力的数据。',
          path: ['data'],
        });
      }
    }

    if (section.status === 'empty') {
      const isEmpty =
        section.data === undefined ||
        section.data === null ||
        (Array.isArray(section.data) && section.data.length === 0);
      if (!isEmpty) {
        context.addIssue({
          code: 'custom',
          message: 'empty 分段只能携带空数组、null 或省略数据。',
          path: ['data'],
        });
      }
    }

    if (section.status === 'unsupported' || section.status === 'unavailable') {
      if (!section.error) {
        context.addIssue({
          code: 'custom',
          message: 'unsupported/unavailable 分段必须携带诊断信息。',
          path: ['error'],
        });
      }
      if (section.data !== undefined && section.data !== null) {
        context.addIssue({
          code: 'custom',
          message: 'unsupported/unavailable 分段不能携带数据。',
          path: ['data'],
        });
      }
    }
  },
);

export const marketDetailSectionSchema =
  marketDetailSectionSchemaImplementation as z.ZodType<MarketDetailSection>;

export const marketDetailDependencySchema = z
  .object({
    status: marketDetailSectionStatusSchema,
    error: marketDetailDiagnosticSchema.optional(),
  })
  .superRefine((dependency, context) => {
    if (dependency.status === 'unavailable' && !dependency.error) {
      context.addIssue({
        code: 'custom',
        message: 'unavailable 依赖必须携带诊断信息。',
        path: ['error'],
      });
    }
  });

const marketDetailResponseBaseSchema = z
  .object({
    version: z.literal(1),
    symbol: z.string().min(1),
    assetType: marketDetailAssetTypeSchema,
    identity: z.object({
      source: z.enum(['asset', 'catalog', 'symbol', 'unknown']),
      status: z.enum(['confirmed', 'provider', 'unknown']),
    }),
    requested: z.array(marketDetailCapabilitySchema),
    capabilities: z.object({
      supported: z.array(marketDetailCapabilitySchema),
      unsupported: z.array(marketDetailCapabilitySchema),
    }),
    limits: z.object({
      bars: z.number().int().positive(),
      nav: z.number().int().positive(),
    }),
    sections: z.record(z.string(), marketDetailSectionSchema),
    dependencies: z.record(z.string(), marketDetailDependencySchema),
    requestId: z.string().min(1),
    generatedAt: isoDate,
  })
  .passthrough();

const marketDetailResponseSchemaImplementation = marketDetailResponseBaseSchema.superRefine(
  (response, context) => {
    const supported = new Set(response.capabilities.supported);
    const unsupported = new Set(response.capabilities.unsupported);
    for (const capability of supported) {
      if (unsupported.has(capability)) {
        context.addIssue({
          code: 'custom',
          message: 'supported 与 unsupported 不能包含相同能力。',
          path: ['capabilities'],
        });
        break;
      }
    }

    for (const [key, section] of Object.entries(response.sections)) {
      if (key !== section.capability) {
        context.addIssue({
          code: 'custom',
          message: '分段键必须与 capability 一致。',
          path: ['sections', key, 'capability'],
        });
      }
      if (!response.requested.includes(section.capability)) {
        context.addIssue({
          code: 'custom',
          message: '响应分段必须属于 requested 能力。',
          path: ['sections', key],
        });
      }
    }

    for (const capability of response.requested) {
      if (!response.sections[capability]) {
        context.addIssue({
          code: 'custom',
          message: '响应必须为每个 requested 能力提供分段状态。',
          path: ['sections', capability],
        });
      }
    }
  },
);

export const marketDetailResponseSchema =
  marketDetailResponseSchemaImplementation as z.ZodType<MarketDetailResponse>;

export type QuoteV1 = z.infer<typeof quoteSchemaV1>;
export type BarInputV1 = z.input<typeof barSchemaV1>;
export type BarV1 = z.output<typeof barSchemaV1>;
export type IndicatorV1 = z.infer<typeof indicatorSchemaV1>;
export type ChipDistributionV1 = z.infer<typeof chipDistributionSchemaV1>;
export type FundNavV1 = z.infer<typeof fundNavSchemaV1>;
export type FundNavHistoryV1 = z.infer<typeof fundNavHistorySchemaV1>;
export type ControlEnvelope = z.infer<typeof controlEnvelopeSchema>;
export type DesiredProviderPolicy = z.infer<typeof desiredProviderPolicySchema>;
export type ProviderManifest = z.infer<typeof providerManifestSchema>;
export type EffectiveProviderPolicy = z.infer<typeof effectiveProviderPolicySchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type CatalogDelta = z.infer<typeof catalogDeltaSchema>;
export type MarketDetailCapability = z.infer<typeof marketDetailCapabilitySchema>;
export type MarketDetailDataByCapability = {
  quote: QuoteV1;
  bars: BarV1[];
  'indicator:MA': IndicatorV1;
  'indicator:MACD': IndicatorV1;
  'indicator:RSI': IndicatorV1;
  chip: ChipDistributionV1;
  'fund-nav': FundNavV1;
  'fund-nav-history': FundNavHistoryV1;
};
export type MarketDetailRequest = {
  symbol: string;
  include?: readonly MarketDetailCapability[];
  barsLimit?: number;
  navLimit?: number;
  refresh?: boolean;
};
export type MarketDetailAssetType = z.infer<typeof marketDetailAssetTypeSchema>;
export type MarketDetailSectionStatus = z.infer<typeof marketDetailSectionStatusSchema>;
export type MarketDetailDiagnostic = z.infer<typeof marketDetailDiagnosticSchema>;
export type MarketDetailSection = {
  [Capability in MarketDetailCapability]: {
    capability: Capability;
    status: MarketDetailSectionStatus;
    data?: MarketDetailDataByCapability[Capability] | null;
    error?: MarketDetailDiagnostic;
  };
}[MarketDetailCapability];
export type MarketDetailDependency = {
  status: MarketDetailSectionStatus;
  error?: MarketDetailDiagnostic;
};
export type MarketDetailResponse = {
  version: 1;
  symbol: string;
  assetType: MarketDetailAssetType;
  identity: {
    source: 'asset' | 'catalog' | 'symbol' | 'unknown';
    status: 'confirmed' | 'provider' | 'unknown';
  };
  requested: MarketDetailCapability[];
  capabilities: {
    supported: MarketDetailCapability[];
    unsupported: MarketDetailCapability[];
  };
  limits: { bars: number; nav: number };
  sections: Partial<Record<MarketDetailCapability, MarketDetailSection>>;
  dependencies: Record<string, MarketDetailDependency>;
  requestId: string;
  generatedAt: string;
};
