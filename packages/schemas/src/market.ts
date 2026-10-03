import { z } from 'zod';
import {
  barSeriesSchema,
  marketIndicatorResultSchema,
  type BarSeries,
  type MarketIndicatorResult,
} from './market-bar-series.js';
import { priceAdjustmentSchema } from './market-price-protocol.js';

const isoDate = z.iso.datetime({ offset: true });
const isoCalendarDate = z.iso.date();
const finite = z.number().finite();
const freshnessSchema = z.enum(['live', 'delayed', 'stale', 'unknown']);
export const currencySchema = z.enum(['CNY', 'HKD', 'USD']);
export type Currency = z.infer<typeof currencySchema>;

export const provenanceSchema = z.object({
  provider: z.string().min(1),
  upstreamSource: z.string().min(1).optional(),
  sourceUrl: z.url().optional(),
  marketTime: isoDate,
  fetchedAt: isoDate,
  freshness: freshnessSchema,
});

export const fxRateSchema = z.object({
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

export const fxRatesResponseSchema = z.object({
  version: z.literal(3),
  baseCurrency: currencySchema,
  asOf: isoCalendarDate,
  fetchedAt: isoDate,
  maxAgeDays: z.number().int().nonnegative(),
  rates: z.array(fxRateSchema),
});
export type FxRate = z.infer<typeof fxRateSchema>;
export type FxRatesResponse = z.infer<typeof fxRatesResponseSchema>;

export const quoteSchema = z
  .object({
    version: z.literal(3),
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
    units: z
      .object({
        priceCurrency: currencySchema,
        volume: z.enum(['share', 'unknown']),
        turnoverCurrency: z.enum(['CNY', 'unknown']),
      })
      .optional(),
  })
  .merge(provenanceSchema.omit({ marketTime: true }))
  .extend({ marketTime: isoDate.nullable() })
  .refine(
    (quote) => quote.high >= Math.max(quote.open, quote.low, quote.price),
    '最高价低于其他价格',
  )
  .refine(
    (quote) => quote.low <= Math.min(quote.open, quote.high, quote.price),
    '最低价高于其他价格',
  );

export const chipDistributionSchema = z.object({
  version: z.literal(3),
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
  servedFromCache: z.boolean().optional(),
  engineVersion: z.string().min(1),
  calculatedAt: isoDate,
});

export const fundNavSchema = z.object({
  version: z.literal(3),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  unitNav: finite.nonnegative(),
  navDate: isoDate,
  provider: z.string().min(1),
  fetchedAt: isoDate,
  freshness: z.enum(['delayed', 'stale', 'unavailable']),
  fallbackUsed: z.boolean().optional(),
  servedFromCache: z.boolean().optional(),
});

export const fundNavHistorySchema = z.array(fundNavSchema).superRefine((points, context) => {
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

export const fundHoldingSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  weight: finite.min(0).max(1),
});

export const fundHoldingsSchema = z
  .object({
    version: z.literal(3),
    fundSymbol: z.string().regex(/^\d{6}\.OF$/),
    reportPeriod: z.string().regex(/^\d{4}-Q[1-4]$/),
    disclosureDate: isoDate.nullable(),
    provider: z.string().min(1),
    fetchedAt: isoDate,
    evidenceVersion: z.string().min(1),
    fallbackUsed: z.boolean().optional(),
    servedFromCache: z.boolean().optional(),
    holdings: z.array(fundHoldingSchema),
  })
  .superRefine((value, context) => {
    const total = value.holdings.reduce((sum, holding) => sum + holding.weight, 0);
    if (total > 1.000001) {
      context.addIssue({
        code: 'custom',
        path: ['holdings'],
        message: '基金披露持仓权重合计不能超过 1',
      });
    }
    const symbols = new Set<string>();
    value.holdings.forEach((holding, index) => {
      if (symbols.has(holding.symbol)) {
        context.addIssue({
          code: 'custom',
          path: ['holdings', index, 'symbol'],
          message: '基金持仓代码不能重复',
        });
      }
      symbols.add(holding.symbol);
    });
  })
  .transform((value) => {
    if (value.disclosureDate && Date.parse(value.disclosureDate) === Date.parse(value.fetchedAt)) {
      return { ...value, disclosureDate: null };
    }
    return value;
  });
export type FundHoldings = z.infer<typeof fundHoldingsSchema>;

export const providerManifestSchema = z.object({
  providerId: z.string().min(1),
  displayName: z.string().min(1),
  version: z.number().int().positive(),
  capabilities: z.record(z.string(), z.array(z.string())),
  configured: z.boolean(),
  enabled: z.boolean(),
  credentialConfigured: z.boolean(),
  requiresCredential: z.boolean().optional(),
  origin: z.enum(['dsa']).optional(),
  markets: z.array(z.string().min(1)).optional(),
  configurationMode: z.enum(['control', 'built_in', 'dsa_environment']).optional(),
  credentialSchema: z
    .object({
      methods: z.array(
        z.object({
          method: z.string().min(1),
          fields: z.array(
            z.object({
              name: z.string().min(1),
              secret: z.boolean(),
              required: z.boolean(),
            }),
          ),
        }),
      ),
    })
    .optional(),
  credentialSource: z.enum(['control', 'environment', 'none', 'built_in']).optional(),
  credentialFieldsConfigured: z.record(z.string(), z.boolean()).optional(),
  credentialMethod: z.string().min(1).nullable().optional(),
  configVersion: z.number().int().nonnegative().optional(),
  upstreamSources: z
    .array(
      z.object({
        sourceId: z.string().min(1),
        displayName: z.string().min(1),
        capabilities: z.record(z.string(), z.array(z.string().min(1))),
      }),
    )
    .optional(),
  updatedAt: isoDate.nullable().optional(),
});

export { catalogItemSchema, catalogSnapshotSchema, catalogDeltaSchema } from './market-catalog.js';
export type { CatalogItem, CatalogSnapshot, CatalogDelta } from './market-catalog.js';

export const instrumentDirectoryItemSchema = z
  .object({
    symbol: z.string().trim().min(1),
    canonicalCode: z.string().trim().min(1),
    instrumentType: z.string().trim().min(1),
    market: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    active: z.boolean(),
  })
  .strict();

export const instrumentDirectorySchema = z
  .object({
    generation: z.number().int().nonnegative(),
    items: z.array(instrumentDirectoryItemSchema),
    unresolvedSymbols: z.array(z.string().trim().min(1)),
  })
  .strict();

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

export const marketDetailRequestSchema = z
  .object({
    symbol: z.string().min(1),
    include: z.array(marketDetailCapabilitySchema).min(1).optional(),
    barsLimit: z.number().int().min(1).max(3000).optional(),
    navLimit: z.number().int().min(1).max(90).optional(),
    adjustment: priceAdjustmentSchema.optional(),
    chartContractVersion: z.literal(3).optional(),
    start: isoCalendarDate.optional(),
    end: isoCalendarDate.optional(),
    indicatorParams: z.record(z.string(), finite).optional(),
    calculationAnchor: isoDate.optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((request, context) => {
    if (request.chartContractVersion !== 3 && (request.barsLimit ?? 30) > 90) {
      context.addIssue({
        code: 'custom',
        path: ['barsLimit'],
        message: '旧版详情最多显示 90 根日线',
      });
    }
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
  quote: quoteSchema,
  bars: barSeriesSchema,
  'indicator:MA': marketIndicatorResultSchema.extend({ name: z.literal('MA') }),
  'indicator:MACD': marketIndicatorResultSchema.extend({ name: z.literal('MACD') }),
  'indicator:RSI': marketIndicatorResultSchema.extend({ name: z.literal('RSI') }),
  chip: chipDistributionSchema,
  'fund-nav': fundNavSchema,
  'fund-nav-history': fundNavHistorySchema,
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

const marketDetailSectionEnvelopeSchema = z.object({
  capability: marketDetailCapabilitySchema,
  status: marketDetailSectionStatusSchema,
  data: z.unknown().optional(),
  error: marketDetailDiagnosticSchema.optional(),
});

const marketDetailResponseSchemaImplementation = z
  .object({
    contractVersion: z.literal(3),
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
      barsHasMoreBefore: z.boolean().optional(),
    }),
    barSeries: barSeriesSchema.optional(),
    sections: z.record(z.string(), marketDetailSectionEnvelopeSchema),
    dependencies: z.record(z.string(), marketDetailDependencySchema),
    requestId: z.string().min(1),
    generatedAt: isoDate,
  })
  .superRefine((response, context) => {
    for (const capability of response.requested) {
      const section = response.sections[capability];
      if (!section) {
        context.addIssue({
          code: 'custom',
          path: ['sections', capability],
          message: '响应必须为每个 requested 能力提供分段状态。',
        });
        continue;
      }
      if (section.capability !== capability) {
        context.addIssue({
          code: 'custom',
          path: ['sections', capability, 'capability'],
          message: '分段键必须与 capability 一致。',
        });
      }
      if (section.status === 'ready' || section.status === 'stale') {
        let parsed: { success: boolean } = { success: true };
        if (capability === 'bars') {
          parsed = barSeriesSchema.safeParse(section.data);
        } else if (capability.startsWith('indicator:')) {
          const indicator = marketIndicatorResultSchema.safeParse(section.data);
          parsed = indicator;
          if (
            indicator.success &&
            response.barSeries &&
            indicator.data.inputFingerprint !== response.barSeries.inputFingerprint
          ) {
            context.addIssue({
              code: 'custom',
              path: ['sections', capability, 'data', 'inputFingerprint'],
              message: '详情指标必须与日线序列共享 inputFingerprint。',
            });
          }
        }
        if (!parsed.success) {
          context.addIssue({
            code: 'custom',
            path: ['sections', capability, 'data'],
            message: '详情分段数据契约不匹配。',
          });
        }
        if (capability.startsWith('indicator:') && !response.barSeries) {
          context.addIssue({
            code: 'custom',
            path: ['barSeries'],
            message: '指标分段必须携带对应的日线序列。',
          });
        }
      }
    }
  });

export const marketDetailResponseSchema =
  marketDetailResponseSchemaImplementation as z.ZodType<MarketDetailResponse>;

export type Quote = z.infer<typeof quoteSchema>;
export type ChipDistribution = z.infer<typeof chipDistributionSchema>;
export type FundNav = z.infer<typeof fundNavSchema>;
export type FundNavHistory = z.infer<typeof fundNavHistorySchema>;
export type ProviderManifest = z.infer<typeof providerManifestSchema>;
export type InstrumentDirectoryItem = z.infer<typeof instrumentDirectoryItemSchema>;
export type InstrumentDirectory = z.infer<typeof instrumentDirectorySchema>;
export type MarketDetailCapability = z.infer<typeof marketDetailCapabilitySchema>;
export type MarketDetailDataByCapability = {
  quote: Quote;
  bars: BarSeries;
  'indicator:MA': MarketIndicatorResult;
  'indicator:MACD': MarketIndicatorResult;
  'indicator:RSI': MarketIndicatorResult;
  chip: ChipDistribution;
  'fund-nav': FundNav;
  'fund-nav-history': FundNavHistory;
};
export type MarketDetailRequest = {
  symbol: string;
  include?: readonly MarketDetailCapability[];
  barsLimit?: number;
  navLimit?: number;
  adjustment?: z.infer<typeof priceAdjustmentSchema>;
  chartContractVersion?: 3;
  start?: string;
  end?: string;
  indicatorParams?: Readonly<Record<string, number>>;
  calculationAnchor?: string;
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
  contractVersion: 3;
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
  limits: { bars: number; nav: number; barsHasMoreBefore?: boolean };
  barSeries?: BarSeries;
  sections: Partial<Record<MarketDetailCapability, MarketDetailSection>>;
  dependencies: Record<string, MarketDetailDependency>;
  requestId: string;
  generatedAt: string;
};
