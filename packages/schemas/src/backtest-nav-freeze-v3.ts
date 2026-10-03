import { z } from 'zod';
import {
  backtestExecutionModelSchemaV3,
  executionModelRunIssues,
  executionModelSnapshotRefSchema,
} from './backtest-execution-model.js';
import { runConfigSchemaV3, validateRunConfig } from './backtest-contract.js';
import { positiveDecimalStringSchema } from './monetary-values.js';
import { marketRouteTargetSchema } from './market-route-target.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';
import {
  backtestNavPublicationEvidenceV3Schema,
  backtestNavVisibilityV3Schema,
} from './backtest-nav-visibility-v3.js';

const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const date = z.iso.date();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fundSymbol = z.string().regex(/^\d{6}\.OF$/);
const notAfter = (left: string, right: string): boolean => {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  return order !== undefined && order <= 0;
};

export const backtestNavRouteKeyV3Schema = z.strictObject({
  kind: z.literal('data'),
  market: z.literal('CN'),
  assetType: z.literal('MUTUAL_FUND'),
  capability: z.literal('FUND_NAV_HISTORY'),
});

/** 净值运行输入不携带场内价格坐标。实际来源由准备阶段选择并冻结。 */
export const backtestNavRunConfigV3Schema = z
  .strictObject(runConfigSchemaV3.shape)
  .omit({
    executionPriceProtocol: true,
    priceInputBindings: true,
    frozenExecutionWindow: true,
    frozenWarmupBudgetSessions: true,
  })
  .extend({
    executionModel: backtestExecutionModelSchemaV3,
    navInput: z.strictObject({ kind: z.literal('nav'), symbol: fundSymbol }),
    navVisibility: backtestNavVisibilityV3Schema,
  })
  .superRefine((config, context) => {
    validateRunConfig({ ...config, executionModel: undefined }, context);
    if (
      config.navVisibility.mode === 'research-assumption' &&
      (config.navVisibility.rule.symbol !== config.navInput.symbol ||
        !notAfter(config.navVisibility.rule.configuredAt, config.dataAsOf))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['navVisibility'],
        message: '研究规则标的不符或在冻结时点尚未配置',
      });
    }
    if (config.baseCurrency !== 'CNY') {
      context.addIssue({
        code: 'custom',
        path: ['baseCurrency'],
        message: '场外净值运行只支持 CNY',
      });
    }
    if (
      config.executionModel.scope.instrumentType !== 'NAV_FUND' ||
      config.executionModel.scope.market !== 'CN' ||
      config.executionModel.scope.symbol !== config.navInput.symbol
    ) {
      context.addIssue({
        code: 'custom',
        path: ['executionModel', 'scope'],
        message: '净值执行模型必须与基金标的相同',
      });
    }
    for (const issue of executionModelRunIssues(config.executionModel, config)) {
      context.addIssue({
        code: 'custom',
        path: ['executionModel', ...issue.path],
        message: issue.message,
      });
    }
  });
export type BacktestNavRunConfigV3 = z.infer<typeof backtestNavRunConfigV3Schema>;

export const backtestNavFactV3Schema = z.strictObject({
  symbol: fundSymbol,
  valuationDate: date,
  nav: positiveDecimalStringSchema,
  status: z.literal('supported'),
  freshness: z.enum(['live', 'delayed']),
  quality: z.literal('complete'),
  occurredAt: timestamp,
  availableAt: timestamp,
  publicationEvidence: backtestNavPublicationEvidenceV3Schema,
});

/** 已完成冻结的 NAV 输入必须显式绑定真实发布证据或研究可见性假设。 */
export const backtestNavSnapshotManifestV3Schema = z
  .strictObject({
    manifestVersion: z.literal('snapshot-manifest-v3'),
    inputKind: z.literal('nav'),
    status: z.literal('finalized'),
    runId: text,
    strategyVersionId: text,
    strategyVersionHash: hash,
    runConfigChecksum: hash,
    dataAsOf: timestamp,
    navInput: z.strictObject({ kind: z.literal('nav'), symbol: fundSymbol }),
    navVisibility: backtestNavVisibilityV3Schema,
    executionModel: executionModelSnapshotRefSchema,
    source: z.strictObject({
      routeKey: backtestNavRouteKeyV3Schema,
      target: marketRouteTargetSchema.strict(),
      policyRevision: z.number().int().positive(),
      adapterRevision: text,
      providerRevision: text,
      sourceRevision: text,
      credentialRevision: text.nullable(),
      responseHash: hash,
      capturedAt: timestamp,
    }),
    calendar: z.strictObject({
      market: z.literal('CN'),
      timezone: z.literal('Asia/Shanghai'),
      version: text,
      contentHash: hash,
      evidenceRef: text,
      availableAt: timestamp,
      expectedValuationDates: z.array(date).min(1),
    }),
    dateRange: z.strictObject({ startDate: date, endDate: date, warmupStartDate: date }),
    facts: z.array(backtestNavFactV3Schema).min(1),
    coverage: z.strictObject({ complete: z.literal(true), startDate: date, endDate: date }),
    artifact: z.strictObject({
      key: z.literal('execution/nav.parquet'),
      format: z.literal('parquet'),
      compression: z.literal('zstd'),
      contentHash: hash,
      sizeBytes: z.number().int().positive(),
    }),
    contextArtifact: z.strictObject({
      key: z.literal('metadata/nav-context-v3.parquet'),
      format: z.literal('parquet'),
      compression: z.literal('zstd'),
      contentHash: hash,
      sizeBytes: z.number().int().positive(),
    }),
    comparableDataFingerprint: hash,
    contentHash: hash,
  })
  .superRefine((manifest, context) => {
    const { startDate, endDate, warmupStartDate } = manifest.dateRange;
    if (warmupStartDate > startDate || startDate > endDate) {
      context.addIssue({ code: 'custom', path: ['dateRange'], message: '净值冻结区间无效' });
    }
    if (manifest.coverage.startDate !== warmupStartDate || manifest.coverage.endDate !== endDate) {
      context.addIssue({ code: 'custom', path: ['coverage'], message: '净值覆盖范围不匹配' });
    }
    if (!notAfter(manifest.calendar.availableAt, manifest.dataAsOf)) {
      context.addIssue({
        code: 'custom',
        path: ['calendar', 'availableAt'],
        message: '估值日历在冻结时点尚不可见',
      });
    }
    const expected = manifest.calendar.expectedValuationDates;
    const actual = manifest.facts.map((fact) => fact.valuationDate);
    if (
      expected.some(
        (value, index) =>
          value < warmupStartDate ||
          value > endDate ||
          (index > 0 && value <= expected[index - 1]!),
      ) ||
      expected.length !== actual.length ||
      expected.some((value, index) => value !== actual[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: '净值事实未完整覆盖预期估值日',
      });
    }
    manifest.facts.forEach((fact, index) => {
      if (fact.symbol !== manifest.navInput.symbol) {
        context.addIssue({
          code: 'custom',
          path: ['facts', index, 'symbol'],
          message: '净值事实标的与冻结输入不一致',
        });
      }
      const proof = fact.publicationEvidence;
      const visibility = manifest.navVisibility;
      const publishedAt =
        proof.kind === 'source-publication-record'
          ? proof.sourcePublishedAt
          : proof.assumedAvailableAt;
      if (
        (visibility.mode === 'strict-publication') !==
          (proof.kind === 'source-publication-record') ||
        (visibility.mode === 'research-assumption' &&
          proof.kind === 'research-assumption' &&
          (proof.ruleHash !== visibility.rule.contentHash ||
            proof.disclosureCalendarHash !== visibility.disclosureCalendarHash ||
            proof.assumedAvailableAt !== fact.availableAt ||
            visibility.rule.symbol !== fact.symbol ||
            fact.valuationDate < visibility.rule.applicableRange.startDate ||
            fact.valuationDate > visibility.rule.applicableRange.endDate))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['facts', index, 'publicationEvidence'],
          message: '净值可见性模式或研究规则绑定不符',
        });
      }
      if (
        !notAfter(fact.occurredAt, publishedAt) ||
        !notAfter(fact.occurredAt, manifest.source.capturedAt) ||
        (proof.kind === 'source-publication-record' &&
          !notAfter(publishedAt, manifest.source.capturedAt)) ||
        !notAfter(publishedAt, fact.availableAt) ||
        !notAfter(fact.availableAt, manifest.dataAsOf)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['facts', index, 'availableAt'],
          message: '净值来源发布时间、可见时间与冻结时点不一致',
        });
      }
    });
    if (
      !notAfter(manifest.source.capturedAt, manifest.dataAsOf) ||
      (manifest.navVisibility.mode === 'research-assumption' &&
        (manifest.navVisibility.disclosureCalendarHash !== manifest.calendar.contentHash ||
          !notAfter(manifest.navVisibility.rule.configuredAt, manifest.dataAsOf)))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: '来源采集时间或研究日历绑定无效',
      });
    }
  });
export type BacktestNavSnapshotManifestV3 = z.infer<typeof backtestNavSnapshotManifestV3Schema>;

/** 冻结读取入口统一核对运行配置与净值产物的身份、时间及模型版本。 */
export const backtestNavFrozenInputV3Schema = z
  .strictObject({
    runConfig: backtestNavRunConfigV3Schema,
    manifest: backtestNavSnapshotManifestV3Schema,
  })
  .superRefine(({ runConfig, manifest }, context) => {
    if (
      runConfig.navInput.symbol !== manifest.navInput.symbol ||
      runConfig.startDate !== manifest.dateRange.startDate ||
      runConfig.endDate !== manifest.dateRange.endDate ||
      runConfig.dataAsOf !== manifest.dataAsOf ||
      JSON.stringify(runConfig.navVisibility) !== JSON.stringify(manifest.navVisibility) ||
      runConfig.executionModel.id !== manifest.executionModel.id ||
      runConfig.executionModel.version !== manifest.executionModel.version
    ) {
      context.addIssue({
        code: 'custom',
        path: ['manifest'],
        message: 'NAV 冻结输入与运行配置身份不一致',
      });
    }
  });
export type BacktestNavFrozenInputV3 = z.infer<typeof backtestNavFrozenInputV3Schema>;
