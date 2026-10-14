import { z } from 'zod';
import { marketTradingStatusResponseV3Schema } from './market-trading-status-v3.js';

export const tradingStatusFreezeVersionV3 = 'frozen-trading-status-v1' as const;
export const tradingStatusExtendedFreezeVersionV3 = 'frozen-trading-status-v2' as const;
export const tradingStatusLifecycleFreezeVersionV3 = 'frozen-trading-status-v3' as const;
export const tradingStatusStructuredFreezeVersionV3 = 'frozen-trading-status-v4' as const;
export const tradingStatusBasicLifecycleFreezeVersionV3 = 'frozen-trading-status-v5' as const;
const freezeVersion = z.enum([
  tradingStatusFreezeVersionV3,
  tradingStatusExtendedFreezeVersionV3,
  tradingStatusLifecycleFreezeVersionV3,
  tradingStatusStructuredFreezeVersionV3,
  tradingStatusBasicLifecycleFreezeVersionV3,
]);
export const tradingStatusArtifactKeyV3 = 'metadata/trading-status-v3.parquet' as const;
const text = z.string().trim().min(1);
export const backtestTradingStatusDisclosureV3Schema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('source'),
    response: marketTradingStatusResponseV3Schema,
    fallbackReason: text.optional(),
    structuredResearch: z
      .strictObject({
        mode: z.literal('fixed-source-status-research-v1'),
        priceDataAsOf: z.iso.datetime({ offset: true }),
        frozenAt: z.iso.datetime({ offset: true }),
        observedAfterPriceCutoff: z.boolean(),
      })
      .optional(),
    executionInterpretation: z
      .strictObject({
        policy: z.enum(['exclude-known-halt-date-v1', 'not-modeled']),
        excludedDates: z.array(z.iso.date()),
        reason: text,
      })
      .optional(),
  }),
  z.strictObject({ status: z.literal('notIncluded'), reason: text }),
]);
export const backtestTradingStatusSnapshotRefV3Schema = z.strictObject({
  artifactKey: text,
  freezeVersion,
});
export const backtestTradingStatusSnapshotV3Schema = z
  .strictObject({
    freezeVersion,
    runConfigChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    disclosure: backtestTradingStatusDisclosureV3Schema,
  })
  .superRefine((value, context) => {
    const life = value.disclosure.status === 'source' && value.disclosure.response.basicLifecycle;
    if (Boolean(life) !== (value.freezeVersion === tradingStatusBasicLifecycleFreezeVersionV3))
      context.addIssue({
        code: 'custom',
        path: ['freezeVersion'],
        message: '基础日期只使用独立 v5 冻结版本，不得回填旧身份',
      });
    if (value.disclosure.status === 'source' && value.disclosure.response.sourceRecords) {
      const research = value.disclosure.structuredResearch;
      const records = value.disclosure.response.sourceRecords;
      if (
        !research ||
        Date.parse(research.frozenAt) <
          Date.parse(value.disclosure.response.provenance.fetchedAt) ||
        research.observedAfterPriceCutoff !==
          records.some(
            (record) => Date.parse(record.observedAt) > Date.parse(research.priceDataAsOf),
          )
      )
        context.addIssue({
          code: 'custom',
          path: ['disclosure', 'structuredResearch'],
          message: '结构化状态必须冻结实际时钟及固定来源研究假设',
        });
    }
    if (
      value.disclosure.status === 'source' &&
      value.disclosure.response.sourceRecords &&
      value.freezeVersion !== tradingStatusStructuredFreezeVersionV3 &&
      value.freezeVersion !== tradingStatusBasicLifecycleFreezeVersionV3
    )
      context.addIssue({
        code: 'custom',
        path: ['freezeVersion'],
        message: '结构化状态必须使用独立冻结版本',
      });
    if (
      value.freezeVersion === tradingStatusFreezeVersionV3 &&
      value.disclosure.status === 'source' &&
      value.disclosure.response.days.some(
        (day) =>
          day.riskWarning ||
          day.dailyPriceLimit ||
          day.intradayHalts ||
          day.listingPhase ||
          day.noDailyPriceLimit,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['freezeVersion'],
        message: '扩展状态维度必须使用独立冻结版本，不能回填旧停复牌身份',
      });
    }
    if (
      value.freezeVersion !== tradingStatusLifecycleFreezeVersionV3 &&
      value.freezeVersion !== tradingStatusStructuredFreezeVersionV3 &&
      value.disclosure.status === 'source' &&
      value.disclosure.response.days.some((day) => day.listingPhase || day.noDailyPriceLimit)
    )
      context.addIssue({
        code: 'custom',
        path: ['freezeVersion'],
        message: '上市阶段必须使用新冻结版本，不能回填旧状态身份',
      });
  });
export type BacktestTradingStatusSnapshotV3 = z.infer<typeof backtestTradingStatusSnapshotV3Schema>;
export type BacktestTradingStatusSnapshotRefV3 = z.infer<
  typeof backtestTradingStatusSnapshotRefV3Schema
>;
export type BacktestTradingStatusDisclosureV3 = z.infer<
  typeof backtestTradingStatusDisclosureV3Schema
>;
