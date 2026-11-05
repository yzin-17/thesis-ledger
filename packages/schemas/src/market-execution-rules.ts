import { z } from 'zod';
import { currencyCodeSchema, positiveDecimalStringSchema } from './monetary-values.js';
import { marketQuoteSymbolSchema } from './market-quote-identity.js';
import { compareMarketPitEvidenceInstantStringsV1 as compareEvidenceInstants } from './market-pit-evidence-instant-v1.js';

const instant = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => compareEvidenceInstants(value, value) === 0,
    '规则时刻必须具备明确时区及有效精度',
  );
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema = z
  .strictObject({
    symbol: z.union([marketQuoteSymbolSchema, z.string().regex(/^\d{6}\.OF$/)]),
    market: z.enum(['CN', 'HK', 'US']),
    exchange: z.string().trim().min(1),
    board: z.string().trim().min(1).nullable(),
    assetType: z.enum(['STOCK', 'ETF', 'MUTUAL_FUND']),
    currency: currencyCodeSchema,
    businessType: z.enum(['AUCTION', 'BLOCK', 'AFTER_HOURS_FIXED_PRICE', 'OFF_EXCHANGE']),
    side: z.enum(['BUY', 'SELL']),
    subject: z.enum(['SINGLE_EXECUTION', 'AGGREGATED_EXECUTIONS']),
  })
  .superRefine((scope, context) => {
    const matchesMarket = {
      CN: /\.(SH|SZ|BJ|OF)$/.test(scope.symbol),
      HK: scope.symbol.endsWith('.HK'),
      US: scope.symbol.endsWith('.US'),
    };
    if (!matchesMarket[scope.market])
      context.addIssue({ code: 'custom', path: ['market'], message: '标的与规则市场不一致' });
    if (scope.symbol.endsWith('.OF') !== (scope.assetType === 'MUTUAL_FUND'))
      context.addIssue({
        code: 'custom',
        path: ['assetType'],
        message: '基金标的与资产类别不一致',
      });
  });

const stepSchema = z
  .strictObject({
    step: positiveDecimalStringSchema.refine((value) => value.length <= 64, '步长过长'),
    decimals: z.number().int().min(0).max(18),
  })
  .superRefine((value, context) => {
    const fraction = (value.step.split('.')[1] ?? '').replace(/0+$/, '');
    if (fraction.length > value.decimals)
      context.addIssue({ code: 'custom', path: ['decimals'], message: '声明精度不能表达规则步长' });
  });

export const executionRuleRequestSchema = z
  .strictObject({
    contractVersion: z.literal(3),
    consumer: z.literal('thesis-ledger'),
    requestId: z.string().trim().min(1),
    scope: scopeSchema,
    window: z.strictObject({ start: instant, end: instant }),
  })
  .superRefine((request, context) => {
    const order = compareEvidenceInstants(request.window.start, request.window.end);
    if (order === undefined || order > 0)
      context.addIssue({ code: 'custom', path: ['window'], message: '成交时间窗口顺序错误' });
  });

export const executionRulePackSchema = z
  .strictObject({
    ruleVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    provider: z.string().trim().min(1),
    fetchedAt: instant,
    scope: scopeSchema,
    sourceReview: z.strictObject({
      amendments: z.literal('checked'),
      deferrals: z.literal('checked'),
      conflicts: z.literal('resolved'),
    }),
    sources: z
      .array(
        z.strictObject({
          issuer: z.string().trim().min(1),
          publicationId: z.string().trim().min(1),
          publishedOn: z.iso.date(),
          role: z.enum(['text', 'amendment', 'deferral']),
          url: z.url(),
          sha256: digest,
        }),
      )
      .min(1),
    validity: z.strictObject({
      effectiveFrom: instant,
      effectiveUntil: instant.nullable(),
      verifiedThrough: instant,
    }),
    quantity: stepSchema,
    price: stepSchema,
  })
  .superRefine((pack, context) => {
    if (!pack.sources.some((source) => source.role === 'text'))
      context.addIssue({ code: 'custom', path: ['sources'], message: '规则包缺少正文来源' });
    const sourceDigests = new Map<string, string>();
    for (const source of pack.sources) {
      if (sourceDigests.has(source.url) && sourceDigests.get(source.url) !== source.sha256)
        context.addIssue({
          code: 'custom',
          path: ['sources'],
          message: '同一来源存在冲突内容摘要',
        });
      sourceDigests.set(source.url, source.sha256);
    }
    const { effectiveFrom, effectiveUntil, verifiedThrough } = pack.validity;
    const fromToVerified = compareEvidenceInstants(effectiveFrom, verifiedThrough);
    const verifiedToFetch = compareEvidenceInstants(verifiedThrough, pack.fetchedAt);
    const fromToUntil =
      effectiveUntil === null ? -1 : compareEvidenceInstants(effectiveFrom, effectiveUntil);
    if (
      fromToVerified === undefined ||
      fromToVerified > 0 ||
      verifiedToFetch === undefined ||
      verifiedToFetch > 0 ||
      fromToUntil === undefined ||
      fromToUntil >= 0
    )
      context.addIssue({
        code: 'custom',
        path: ['validity'],
        message: '规则有效或已核对时间边界矛盾',
      });
  });

/** 结构自洽的数据不等于来源可信或命令 VERIFIED；两者由实际生产/消费链验证。 */
export const executionRuleResponseSchema = z
  .discriminatedUnion('status', [
    z.strictObject({
      request: executionRuleRequestSchema,
      status: z.literal('available'),
      pack: executionRulePackSchema,
    }),
    z.strictObject({
      request: executionRuleRequestSchema,
      status: z.literal('unavailable'),
      reasonCode: z.enum([
        'source_missing',
        'scope_uncovered',
        'time_unproven',
        'semantics_unsupported',
        'source_conflict',
        'content_unverified',
      ]),
    }),
  ])
  .superRefine((response, context) => {
    if (response.status === 'unavailable') return;
    const { request, pack } = response;
    for (const [key, value] of Object.entries(request.scope)) {
      if (value !== pack.scope[key as keyof typeof pack.scope])
        context.addIssue({
          code: 'custom',
          path: ['pack', 'scope', key],
          message: '规则范围与请求不一致',
        });
    }
    const { start, end } = request.window;
    const fromToStart = compareEvidenceInstants(pack.validity.effectiveFrom, start);
    const endToVerified = compareEvidenceInstants(end, pack.validity.verifiedThrough);
    const endToUntil =
      pack.validity.effectiveUntil === null
        ? -1
        : compareEvidenceInstants(end, pack.validity.effectiveUntil);
    if (
      fromToStart === undefined ||
      fromToStart > 0 ||
      endToVerified === undefined ||
      endToVerified > 0 ||
      endToUntil === undefined ||
      endToUntil >= 0
    )
      context.addIssue({
        code: 'custom',
        path: ['pack', 'validity'],
        message: '规则未覆盖整个成交时间窗口',
      });
  });

export type ExecutionRuleRequest = z.infer<typeof executionRuleRequestSchema>;
export type ExecutionRulePack = z.infer<typeof executionRulePackSchema>;
export type ExecutionRuleResponse = z.infer<typeof executionRuleResponseSchema>;
