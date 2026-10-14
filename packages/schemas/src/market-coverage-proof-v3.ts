import { z } from 'zod';

const text = z.string().trim().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

export const marketCalendarTimezonesV3 = {
  CN: 'Asia/Shanghai',
  HK: 'Asia/Hong_Kong',
  US: 'America/New_York',
} as const;

const marketSchema = z.enum(['CN', 'HK', 'US']);

const supportedRangeV3Schema = z
  .strictObject({ start: isoDate, end: isoDate })
  .superRefine((range, context) => {
    if (range.start > range.end) {
      context.addIssue({ code: 'custom', path: ['end'], message: '日历支持范围结束日早于开始日' });
    }
  });

const calendarV3Schema = z
  .strictObject({
    market: marketSchema,
    timezone: z.enum(['Asia/Shanghai', 'Asia/Hong_Kong', 'America/New_York']),
    source: text,
    revision: text,
    supportedRange: supportedRangeV3Schema,
    expectedSessionDates: z.array(isoDate).max(20_000),
  })
  .superRefine((calendar, context) => {
    if (calendar.timezone !== marketCalendarTimezonesV3[calendar.market]) {
      context.addIssue({
        code: 'custom',
        path: ['timezone'],
        message: '交易日历时区与市场不一致',
      });
    }
    for (let index = 1; index < calendar.expectedSessionDates.length; index += 1) {
      if (calendar.expectedSessionDates[index]! <= calendar.expectedSessionDates[index - 1]!) {
        context.addIssue({
          code: 'custom',
          path: ['expectedSessionDates', index],
          message: '预期交易日必须严格升序且唯一',
        });
      }
    }
  });

const listingFactV3Schema = z.strictObject({
  symbol: text,
  firstTradingDate: isoDate,
  source: text,
  revision: text,
  knownAt: isoDateTime,
});

/** 上市信息缺失时只记录标的与未知状态；已知信息沿用现有结构。 */
export const marketListingInformationV3Schema = z.union([
  listingFactV3Schema,
  z.strictObject({ symbol: text, status: z.literal('unknown') }),
]);
export type MarketListingInformationV3 = z.infer<typeof marketListingInformationV3Schema>;

/** 仅已有上市日期能够证明某日位于上市之前。 */
export const isBeforeKnownListingDateV3 = (
  listing: MarketListingInformationV3,
  date: string,
): boolean => 'firstTradingDate' in listing && date < listing.firstTradingDate;

const marketListingInformationValuesV3 = (value: MarketListingInformationV3): string[] => {
  if ('status' in value) {
    return [value.symbol, value.status];
  }
  return [value.symbol, value.firstTradingDate, value.source, value.revision, value.knownAt];
};

/** 独立上市信息的稳定编码；已知分支与原覆盖证明中的数组编码一致。 */
export const canonicalMarketListingInformationEncodingV3 = (
  information: MarketListingInformationV3,
) =>
  JSON.stringify(
    marketListingInformationValuesV3(marketListingInformationV3Schema.parse(information)),
  );

const completedWindowV3Schema = z.strictObject({
  status: z.literal('complete'),
  requestedStart: isoDate,
  requestedEnd: isoDate,
});

const completedPaginationV3Schema = z.strictObject({
  status: z.literal('complete'),
  pagesFetched: z.number().int().min(1).max(1_000),
  continuationPending: z.literal(false),
});

/**
 * A successful V3 response carries evidence for its calendar window, listing boundary,
 * and exhausted pagination. It is a consistency contract, not source authentication.
 */
export const marketCoverageProofV3Schema = z
  .strictObject({
    calendar: calendarV3Schema,
    listing: marketListingInformationV3Schema,
    window: completedWindowV3Schema,
    pagination: completedPaginationV3Schema,
  })
  .superRefine((proof, context) => {
    const { requestedStart, requestedEnd } = proof.window;
    const { supportedRange, expectedSessionDates } = proof.calendar;

    if (requestedStart > requestedEnd) {
      context.addIssue({
        code: 'custom',
        path: ['window', 'requestedEnd'],
        message: '完整窗口结束日早于开始日',
      });
    }
    if (supportedRange.start > requestedStart || supportedRange.end < requestedEnd) {
      context.addIssue({
        code: 'custom',
        path: ['calendar', 'supportedRange'],
        message: '日历支持范围未覆盖完整请求窗口',
      });
    }
    expectedSessionDates.forEach((date, index) => {
      if (date < requestedStart || date > requestedEnd) {
        context.addIssue({
          code: 'custom',
          path: ['calendar', 'expectedSessionDates', index],
          message: '预期交易日超出请求窗口',
        });
      }
      if (date < supportedRange.start || date > supportedRange.end) {
        context.addIssue({
          code: 'custom',
          path: ['calendar', 'expectedSessionDates', index],
          message: '预期交易日超出日历支持范围',
        });
      }
    });
  });
export type MarketCoverageProofV3 = z.infer<typeof marketCoverageProofV3Schema>;

/** 已知上市日约束预期交易日；未知上市日保留整个请求日历。 */
export const marketCoverageSessionDatesV3 = (proof: MarketCoverageProofV3): string[] => {
  return proof.calendar.expectedSessionDates.filter(
    (date) => !isBeforeKnownListingDateV3(proof.listing, date),
  );
};

/**
 * Stable ordered encoding for cache/fingerprint composition. Call with parsed proof data;
 * ordered date arrays are enforced by the schema, so locale and object-key order do not vary.
 */
export const canonicalMarketCoverageProofEncodingV3 = (proof: MarketCoverageProofV3) => {
  const value = marketCoverageProofV3Schema.parse(proof);
  return JSON.stringify([
    3,
    [
      value.calendar.market,
      value.calendar.timezone,
      value.calendar.source,
      value.calendar.revision,
      [value.calendar.supportedRange.start, value.calendar.supportedRange.end],
      value.calendar.expectedSessionDates,
    ],
    marketListingInformationValuesV3(value.listing),
    [value.window.status, value.window.requestedStart, value.window.requestedEnd],
    [value.pagination.status, value.pagination.pagesFetched, value.pagination.continuationPending],
  ]);
};
