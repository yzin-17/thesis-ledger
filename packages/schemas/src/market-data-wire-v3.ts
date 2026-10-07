import { z } from 'zod';
import { backtestDailyTradabilityEvidenceV3Schema } from './backtest-daily-tradability.js';
import { observedTradabilityDatesV3 } from './market-daily-tradability-v3.js';
import { barPointSchema, barSeriesIdentitySchema } from './market-bar-series.js';
import {
  marketCalendarTimezonesV3,
  marketCoverageProofV3Schema,
} from './market-coverage-proof-v3.js';
import { sourcePriceBasisSchema } from './market-price-protocol.js';
import { marketRouteKeyIdV3, marketRouteKeyV3Schema } from './market-route-v3.js';

export {
  canonicalMarketCoverageProofEncodingV3,
  marketCalendarTimezonesV3,
  marketCoverageProofV3Schema,
} from './market-coverage-proof-v3.js';
export type { MarketCoverageProofV3 } from './market-coverage-proof-v3.js';

const text = z.string().trim().min(1);
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

const barRouteKeyShapeV3Schema = z.strictObject({
  kind: z.literal('bar'),
  market: z.enum(['CN', 'HK', 'US']),
  assetType: barSeriesIdentitySchema.shape.assetType,
  capability: z.enum(['DAILY_BAR', 'MINUTE_BAR']),
  timeframe: z.enum(['1d', '1m']),
  adjustment: z.enum(['none', 'qfq', 'hfq']),
});

/** Reuses Route V3's key validation and narrows the wire to bar routes only. */
export const marketDataBarRouteKeyV3Schema = marketRouteKeyV3Schema.pipe(barRouteKeyShapeV3Schema);
export type MarketDataBarRouteKeyV3 = z.infer<typeof marketDataBarRouteKeyV3Schema>;

/** An optional pin to one ordered Desired/Effective RouteTarget; it grants no eligibility by itself. */
export const marketDataRouteTargetPinV3Schema = z.strictObject({
  providerId: text,
  upstreamSource: text,
  routeIndex: z.number().int().min(0).max(1),
});
export type MarketDataRouteTargetPinV3 = z.infer<typeof marketDataRouteTargetPinV3Schema>;

/** Data support is advertised independently from the Control handshake version. */
export const marketDataContractCapabilitiesV3Schema = z.strictObject({
  dataContractVersions: z.tuple([z.literal(3)]),
  serviceCapabilities: z.strictObject({ fundNav: z.literal(true) }),
  multiWindowProtocols: z.array(z.literal('market-multi-window-content-v1')).max(1).optional(),
});
export type MarketDataContractCapabilitiesV3 = z.infer<
  typeof marketDataContractCapabilitiesV3Schema
>;

export const marketDataBarSeriesRequestV3Schema = z
  .strictObject({
    contractVersion: z.literal(3),
    requestId: text,
    symbol: text,
    routeKey: marketDataBarRouteKeyV3Schema,
    /** DSA must verify this target remains eligible before dispatching only to it. */
    routeTarget: marketDataRouteTargetPinV3Schema.optional(),
    tradabilityMode: z.literal('assume-untradable-no-bar').optional(),
    start: isoDate,
    end: isoDate,
  })
  .superRefine((request, context) => {
    if (request.start > request.end) {
      context.addIssue({ code: 'custom', path: ['end'], message: '请求区间 end 不得早于 start' });
    }
    if (
      request.tradabilityMode &&
      (request.routeKey.market !== 'CN' || request.routeKey.timeframe !== '1d')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['tradabilityMode'],
        message: '缺日假设仅支持 CN 日线',
      });
    }
  });
export type MarketDataBarSeriesRequestV3 = z.infer<typeof marketDataBarSeriesRequestV3Schema>;

const barPointV3Schema = barPointSchema.strict();
const barsV3Schema = z
  .array(barPointV3Schema)
  .max(100_000)
  .superRefine((bars, context) => {
    for (let index = 0; index < bars.length; index += 1) {
      const point = bars[index]!;
      if (index > 0 && Date.parse(point.timestamp) <= Date.parse(bars[index - 1]!.timestamp)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'timestamp'],
          message: 'timestamp 必须严格递增且唯一',
        });
      }
      if (point.high < Math.max(point.open, point.close, point.low)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'high'],
          message: 'high 必须不低于 OHLC 其余价格',
        });
      }
      if (point.low > Math.min(point.open, point.close, point.high)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'low'],
          message: 'low 必须不高于 OHLC 其余价格',
        });
      }
    }
  });

export const marketDataBarSeriesCoverageV3Schema = z
  .strictObject({
    requestedStart: isoDate,
    requestedEnd: isoDate,
    actualStart: isoDateTime.nullable(),
    actualEnd: isoDateTime.nullable(),
    hasMoreBefore: z.boolean(),
    latestCompleteTradingDate: isoDate.nullable(),
  })
  .superRefine((coverage, context) => {
    if (coverage.requestedStart > coverage.requestedEnd) {
      context.addIssue({
        code: 'custom',
        path: ['requestedEnd'],
        message: 'coverage requestedEnd 不得早于 requestedStart',
      });
    }
    if ((coverage.actualStart === null) !== (coverage.actualEnd === null)) {
      context.addIssue({
        code: 'custom',
        path: ['actualEnd'],
        message: 'actualStart 与 actualEnd 必须同时为空或同时有值',
      });
    }
    if (
      coverage.actualStart &&
      coverage.actualEnd &&
      Date.parse(coverage.actualStart) > Date.parse(coverage.actualEnd)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actualEnd'],
        message: 'actualEnd 不得早于 actualStart',
      });
    }
  });
export type MarketDataBarSeriesCoverageV3 = z.infer<typeof marketDataBarSeriesCoverageV3Schema>;

export const marketDataBarSeriesProvenanceV3Schema = z.strictObject({
  providerId: text,
  upstreamSource: text,
  routeIndex: z.number().int().min(0).max(1),
  effectivePolicyRevision: z.number().int().nonnegative(),
});
export type MarketDataBarSeriesProvenanceV3 = z.infer<typeof marketDataBarSeriesProvenanceV3Schema>;

export const marketDataBarSeriesResponseV3Schema = z
  .strictObject({
    contractVersion: z.literal(3),
    requestId: text,
    symbol: text,
    routeKey: marketDataBarRouteKeyV3Schema,
    bars: barsV3Schema,
    coverage: marketDataBarSeriesCoverageV3Schema,
    coverageProof: marketCoverageProofV3Schema,
    /** DSA source facts only; Server quantity/accounting/history decisions stay out of this wire. */
    sourcePriceBasis: sourcePriceBasisSchema,
    provenance: marketDataBarSeriesProvenanceV3Schema,
    inputFingerprint: text,
    historicalTradabilityWindows: z
      .array(backtestDailyTradabilityEvidenceV3Schema)
      .min(1)
      .max(1_000)
      .optional(),
  })
  .superRefine((response, context) => {
    if (response.sourcePriceBasis.adjustment !== response.routeKey.adjustment) {
      context.addIssue({
        code: 'custom',
        path: ['sourcePriceBasis', 'adjustment'],
        message: '来源价格口径必须与精确 routeKey 一致',
      });
    }
    const proof = response.coverageProof;
    if (proof.calendar.market !== response.routeKey.market) {
      context.addIssue({
        code: 'custom',
        path: ['coverageProof', 'calendar', 'market'],
        message: '交易日历市场必须与精确 RouteKey 一致',
      });
    }
    if (proof.listing.symbol !== response.symbol) {
      context.addIssue({
        code: 'custom',
        path: ['coverageProof', 'listing', 'symbol'],
        message: '上市事实证券代码必须与响应证券一致',
      });
    }
    if (
      proof.window.requestedStart !== response.coverage.requestedStart ||
      proof.window.requestedEnd !== response.coverage.requestedEnd
    ) {
      context.addIssue({
        code: 'custom',
        path: ['coverageProof', 'window'],
        message: '完整窗口证明必须与请求覆盖范围一致',
      });
    }
    if (proof.listing.firstTradingDate > proof.window.requestedEnd) {
      context.addIssue({
        code: 'custom',
        path: ['coverageProof', 'listing', 'firstTradingDate'],
        message: '请求窗口完全早于已证明上市日，必须返回覆盖不足错误',
      });
    }

    let expectedPostListingDates = proof.calendar.expectedSessionDates.filter(
      (date) => date >= proof.listing.firstTradingDate,
    );
    if (response.historicalTradabilityWindows) {
      try {
        expectedPostListingDates = observedTradabilityDatesV3(
          response.historicalTradabilityWindows,
          {
            symbol: response.symbol,
            routeKey: response.routeKey,
            target: response.provenance,
            coverageProof: proof,
          },
        );
        if (
          response.bars.some(
            (bar) => bar.volume <= 0 || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0,
          )
        ) {
          throw new Error('日级已交易 Bar 必须有正成交量及正 OHLC');
        }
      } catch (error) {
        context.addIssue({
          code: 'custom',
          path: ['historicalTradabilityWindows'],
          message: String(error),
        });
      }
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: marketCalendarTimezonesV3[proof.calendar.market],
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const actualTradingDates: string[] = [];
    for (const [index, point] of response.bars.entries()) {
      if (point.completionStatus !== 'complete') {
        context.addIssue({
          code: 'custom',
          path: ['bars', index, 'completionStatus'],
          message: '完整窗口响应中的每根 Bar 均须为 complete',
        });
      }
      const dateParts = new Map(
        formatter.formatToParts(new Date(point.timestamp)).map(({ type, value }) => [type, value]),
      );
      const tradingDate = `${dateParts.get('year')}-${dateParts.get('month')}-${dateParts.get('day')}`;
      if (actualTradingDates.at(-1) !== tradingDate) actualTradingDates.push(tradingDate);
    }
    if (
      actualTradingDates.length !== expectedPostListingDates.length ||
      actualTradingDates.some((date, index) => date !== expectedPostListingDates[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['bars'],
        message: '上市后 Bar 交易日必须与日历预期交易日集合严格一致',
      });
    }
    if (response.bars.length === 0) {
      if (response.coverage.actualStart !== null || response.coverage.actualEnd !== null) {
        context.addIssue({
          code: 'custom',
          path: ['coverage'],
          message: '空 BarSeries 的实际覆盖边界必须为空',
        });
      }
    } else {
      if (response.coverage.actualStart !== response.bars[0]!.timestamp) {
        context.addIssue({
          code: 'custom',
          path: ['coverage', 'actualStart'],
          message: 'actualStart 必须等于首条 Bar 时间',
        });
      }
      if (response.coverage.actualEnd !== response.bars.at(-1)!.timestamp) {
        context.addIssue({
          code: 'custom',
          path: ['coverage', 'actualEnd'],
          message: 'actualEnd 必须等于末条 Bar 时间',
        });
      }
    }
  });
export type MarketDataBarSeriesResponseV3 = z.infer<typeof marketDataBarSeriesResponseV3Schema>;

/**
 * In-process correlation contract for separately transported request/response bodies.
 * Call after parsing both bodies; a request pin must match response provenance exactly.
 */
export const marketDataBarSeriesRequestResponseV3Schema = z
  .strictObject({
    request: marketDataBarSeriesRequestV3Schema,
    response: marketDataBarSeriesResponseV3Schema,
  })
  .superRefine(({ request, response }, context) => {
    if (Boolean(request.tradabilityMode) !== Boolean(response.historicalTradabilityWindows)) {
      context.addIssue({
        code: 'custom',
        path: ['response', 'historicalTradabilityWindows'],
        message: '缺日假设请求必须绑定同次行情的日级证据',
      });
    }
    if (request.requestId !== response.requestId) {
      context.addIssue({
        code: 'custom',
        path: ['response', 'requestId'],
        message: '响应 requestId 必须与请求一致',
      });
    }
    if (request.symbol !== response.symbol) {
      context.addIssue({
        code: 'custom',
        path: ['response', 'symbol'],
        message: '响应证券代码必须与请求一致',
      });
    }
    if (marketRouteKeyIdV3(request.routeKey) !== marketRouteKeyIdV3(response.routeKey)) {
      context.addIssue({
        code: 'custom',
        path: ['response', 'routeKey'],
        message: '响应 RouteKey 必须与请求一致',
      });
    }

    const routeTarget = request.routeTarget;
    if (
      routeTarget &&
      (routeTarget.providerId !== response.provenance.providerId ||
        routeTarget.upstreamSource !== response.provenance.upstreamSource ||
        routeTarget.routeIndex !== response.provenance.routeIndex)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['response', 'provenance'],
        message: '响应 provenance 必须与请求固定的 RouteTarget 一致',
      });
    }
  });
export type MarketDataBarSeriesRequestResponseV3 = z.infer<
  typeof marketDataBarSeriesRequestResponseV3Schema
>;

export const marketDataErrorCodeV3 = {
  unsupportedDataContractVersion: 'unsupported_data_contract_version',
  unsupportedPriceBasis: 'unsupported_price_basis',
  insufficientCoverage: 'insufficient_coverage',
  upstreamFailure: 'upstream_failure',
  invalidResponse: 'invalid_response',
} as const;

export const marketDataErrorMessageV3 = {
  unsupportedDataContractVersion: '不支持请求的数据契约版本',
  unsupportedPriceBasis: '来源不支持请求的价格口径',
  insufficientCoverage: '请求区间的数据覆盖不足',
  upstreamFailure: '行情上游暂时不可用',
  invalidResponse: '行情上游响应格式无效',
} as const;

export const marketDataErrorDetailV3Schema = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal(marketDataErrorCodeV3.unsupportedDataContractVersion),
    message: z.literal(marketDataErrorMessageV3.unsupportedDataContractVersion),
  }),
  z.strictObject({
    code: z.literal(marketDataErrorCodeV3.unsupportedPriceBasis),
    message: z.literal(marketDataErrorMessageV3.unsupportedPriceBasis),
  }),
  z.strictObject({
    code: z.literal(marketDataErrorCodeV3.insufficientCoverage),
    message: z.literal(marketDataErrorMessageV3.insufficientCoverage),
  }),
  z.strictObject({
    code: z.literal(marketDataErrorCodeV3.upstreamFailure),
    message: z.literal(marketDataErrorMessageV3.upstreamFailure),
  }),
  z.strictObject({
    code: z.literal(marketDataErrorCodeV3.invalidResponse),
    message: z.literal(marketDataErrorMessageV3.invalidResponse),
  }),
]);
export type MarketDataErrorDetailV3 = z.infer<typeof marketDataErrorDetailV3Schema>;

export const marketDataErrorEnvelopeV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  requestId: text,
  error: marketDataErrorDetailV3Schema,
});
export type MarketDataErrorEnvelopeV3 = z.infer<typeof marketDataErrorEnvelopeV3Schema>;
