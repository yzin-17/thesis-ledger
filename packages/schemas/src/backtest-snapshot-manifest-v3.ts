import { z } from 'zod';
import { executionModelSnapshotRefSchema } from './backtest-execution-model.js';
import { executionPriceProtocolSchema } from './market-price-protocol.js';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
import { marketDataBarSeriesProvenanceV3Schema } from './market-data-wire-v3.js';
import { marketFrozenWindowRefV3Schema } from './market-frozen-window.js';
import { backtestPublicFeesSnapshotRefV3Schema } from './backtest-public-fees-v3.js';
import { backtestTradingStatusSnapshotRefV3Schema } from './backtest-trading-status-v3.js';
import { backtestStatusCompositionRefV1Schema } from './backtest-status-composition-v1.js';
import { backtestKnownCashSnapshotRefV3Schema } from './backtest-known-cash-binding-v3.js';
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

const snapshotText = z.string().trim().min(1);
const snapshotSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const snapshotTimeframe = z.enum(['1d', '60m', '30m', '15m', '5m', '1m']);
export const benchmarkExecutionModelCostVersionV3 = 'execution-model-cost-v1' as const;
export const wholeShareWindowBenchmarkCostVersionV3 = 'whole-share-window-cost-v1' as const;
export const researchLotShareWindowBenchmarkCostVersionV3 =
  'research-lot-share-window-cost-v1' as const;

/** Actual price-data source recorded by a newly frozen backtest snapshot. */
export const backtestSnapshotActualSourceV3Schema = z
  .strictObject({
    purpose: z.enum(['signal', 'execution', 'benchmark']),
    symbol: snapshotText,
    routeKey: marketRouteKeyV3Schema,
    /** Mirrors DSA V3; catalog evidence not carried on this wire remains in hashed artifacts. */
    provenance: marketDataBarSeriesProvenanceV3Schema,
    inputFingerprint: snapshotText,
    windowProtocol: z.literal('market-multi-window-content-v1').optional(),
  })
  .superRefine((source, context) => {
    if (source.routeKey.kind !== 'bar') {
      context.addIssue({
        code: 'custom',
        path: ['routeKey', 'kind'],
        message: '价格 Snapshot 来源必须引用行情路由',
      });
    }
  });
export type BacktestSnapshotActualSourceV3 = z.infer<typeof backtestSnapshotActualSourceV3Schema>;

const snapshotDependencyClosureSchema = z.strictObject({
  signalSources: z.array(snapshotText),
  executionInstrument: snapshotText,
  benchmark: snapshotText.optional(),
  requiredFx: z.array(snapshotText),
  corporateActions: z.array(snapshotText),
  calendars: z.array(snapshotText),
  instrumentFacts: z.array(snapshotText),
  baseTimeframes: z.array(snapshotTimeframe),
  datasets: z.array(
    z.strictObject({
      instrument: snapshotText,
      purpose: z.enum([
        'signal',
        'execution',
        'benchmark',
        'fx',
        'corporateActions',
        'calendar',
        'instrumentFacts',
        'nav',
      ]),
      requestedTimeframe: snapshotTimeframe,
      baseTimeframe: snapshotTimeframe,
    }),
  ),
});

const snapshotArtifactRefSchema = z.strictObject({
  artifactId: snapshotText,
  key: snapshotText,
  format: z.literal('parquet'),
  compression: z.literal('zstd'),
  contentHash: snapshotSha256,
  sizeBytes: z.number().int().nonnegative(),
});

const snapshotManifestFieldsV3 = {
  manifestVersion: z.literal('snapshot-manifest-v3'),
  runId: snapshotText,
  strategyVersionId: snapshotText,
  strategyVersionHash: snapshotText,
  dataAsOf: isoDateTime,
  runConfigChecksum: snapshotSha256,
  executionModel: executionModelSnapshotRefSchema.optional(),
  publicFees: backtestPublicFeesSnapshotRefV3Schema.optional(),
  tradingStatus: backtestTradingStatusSnapshotRefV3Schema.optional(),
  statusComposition: backtestStatusCompositionRefV1Schema.optional(),
  knownCash: backtestKnownCashSnapshotRefV3Schema.optional(),
  benchmarkCostVersion: z
    .enum([
      benchmarkExecutionModelCostVersionV3,
      wholeShareWindowBenchmarkCostVersionV3,
      researchLotShareWindowBenchmarkCostVersionV3,
    ])
    .optional(),
  executionPriceProtocol: executionPriceProtocolSchema,
  frozenExecutionWindow: marketFrozenWindowRefV3Schema.optional(),
  comparableDataFingerprint: snapshotSha256.optional(),
  actualSources: z.array(backtestSnapshotActualSourceV3Schema),
  aggregationVersion: snapshotText,
  marketRuleVersion: snapshotText,
  calendarVersion: snapshotText,
  corporateActionVersion: snapshotText,
  availabilitySemanticsVersion: snapshotText,
  providerRevisions: z.record(z.string(), snapshotText),
  dependencyClosure: snapshotDependencyClosureSchema,
  dateRange: z.strictObject({ startDate: isoDate, endDate: isoDate, warmupStartDate: isoDate }),
  warmup: z.strictObject({
    lookbackPeriods: z.number().int().nonnegative(),
    lookbackTimeframe: snapshotTimeframe,
    startDate: isoDate,
    rangePolicyVersion: snapshotText,
    calendarBufferDays: z.number().int().nonnegative(),
  }),
  quality: z.strictObject({
    completeness: z.enum(['complete', 'partial', 'unavailable']),
    warnings: z.array(snapshotText),
  }),
  artifacts: z.array(snapshotArtifactRefSchema),
  status: z.enum(['building', 'finalized']),
  contentHash: snapshotSha256.optional(),
};

/** 新 Run 使用的现行冻结 Snapshot manifest 合同。 */
export const backtestSnapshotManifestV3Schema = z
  .strictObject(snapshotManifestFieldsV3)
  .superRefine((manifest, context) => {
    if (manifest.dateRange.startDate > manifest.dateRange.endDate) {
      context.addIssue({
        code: 'custom',
        path: ['dateRange', 'endDate'],
        message: 'Snapshot 执行范围结束日不能早于开始日',
      });
    }
    if (manifest.status === 'building') {
      if (manifest.contentHash !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['contentHash'],
          message: '未 finalized 的 Snapshot 不得携带内容哈希',
        });
      }
      if (manifest.comparableDataFingerprint !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['comparableDataFingerprint'],
          message: '比较指纹只能在 Snapshot finalized 后生成',
        });
      }
      return;
    }
    if (manifest.contentHash === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['contentHash'],
        message: 'finalized Snapshot 必须冻结内容哈希',
      });
    }
    if (manifest.comparableDataFingerprint === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['comparableDataFingerprint'],
        message: 'finalized Snapshot 必须冻结比较数据指纹',
      });
    }
    if (manifest.artifacts.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts'],
        message: 'finalized Snapshot 必须引用数据产物',
      });
    }
    const executionSources = manifest.actualSources.filter(
      (source) => source.purpose === 'execution',
    );
    if (executionSources.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['actualSources'],
        message: 'finalized Snapshot 必须恰好冻结一个执行行情来源',
      });
    } else {
      const executionSource = executionSources[0]!;
      if (
        executionSource.routeKey.kind === 'bar' &&
        executionSource.routeKey.adjustment !==
          manifest.executionPriceProtocol.priceBasis.adjustment
      ) {
        context.addIssue({
          code: 'custom',
          path: ['actualSources'],
          message: '执行行情路由的价格口径必须与冻结价格协议一致',
        });
      }
    }
    const keys = manifest.actualSources.map((source) =>
      JSON.stringify([source.purpose, source.symbol, source.routeKey]),
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', path: ['actualSources'], message: '实际来源不能重复' });
    }
  });
export type BacktestSnapshotManifestV3 = z.infer<typeof backtestSnapshotManifestV3Schema>;
