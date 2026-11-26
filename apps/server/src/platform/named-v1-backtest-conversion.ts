import { deterministicResultChecksum } from '@thesis-ledger/domain';
import {
  backtestPreparationFailureInputSchema,
  backtestResultSchemaV3,
  runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import { isCurrentRunForRead } from '../backtest/backtest-current-run-read.js';
import { hashCanonicalManifest } from '../backtest/backtest-snapshot.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';

const tradeRun = 'backtest-trade-run-v1';
const tradeConfig = 'backtest-trade-config-v1';
const tradeManifest = 'backtest-trade-snapshot-manifest-v1';
const tradeResult = 'backtest-trade-result-v1';
type Json = Record<string, unknown>;
const record = (raw: unknown): Json | undefined =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Json : undefined;

export type BacktestMigrationRow = {
  id: string;
  mode: string;
  status: string;
  stage: string | null;
  errorCode: string | null;
  strategyVersionId: string;
  input: unknown;
  runConfig: unknown;
  snapshotId: string | null;
  snapshotManifest: unknown;
  result: unknown;
  resultChecksum: string | null;
  executionAttempt: number;
};

const unable = (reason: string) => ({ outcome: 'unproven' as const, reason });
export function convertLegacyTradeRunConfig(oldConfig: Json) {
  if (oldConfig.schemaVersion !== '3') return unable('缺少受支持的旧交易回测配置');
  const lifecycle = record(oldConfig.lifecyclePreparation);
  const lifecycleResponse = record(lifecycle?.response);
  const knownCash = record(oldConfig.knownCashPreparation);
  let knownCashPreparation: Json | undefined;
  if (knownCash) {
    const acquisition = record(knownCash.acquisition);
    const exchange = record(acquisition?.exchange);
    const request = record(exchange?.request);
    const response = record(exchange?.response);
    if (knownCash.contentHash !== hashCanonicalManifest(knownCash) ||
        request?.contractVersion !== 3 || response?.contractVersion !== 3)
      return unable('原已知现金准备的来源或摘要不一致');
    knownCashPreparation = { ...knownCash, acquisition: { ...acquisition, exchange: {
      ...exchange, request: { ...request, contractVersion: 1 }, response: { ...response, contractVersion: 1 },
    } } };
    knownCashPreparation.contentHash = hashCanonicalManifest(knownCashPreparation);
  }
  const config = runConfigSchemaV3.safeParse({
    ...oldConfig,
    schemaVersion: tradeConfig,
    ...(lifecycleResponse?.contractVersion === 3 ? {
      lifecyclePreparation: { ...lifecycle, response: { ...lifecycleResponse, contractVersion: 1 } },
    } : {}),
    ...(knownCashPreparation ? { knownCashPreparation } : {}),
  });
  if (!config.success)
    return unable('原运行配置字段未通过校验：' + config.error.issues.map((issue) => issue.path.join('.') || issue.code).join('、'));
  return { outcome: 'convert' as const, runConfig: config.data };
}

/** 先核对旧数据库引用。冻结文件的字节和元数据须在隔离制品目录验证。 */
export function previewTradeBacktest(
  row: BacktestMigrationRow,
  strategy: { schemaVersion: number; definition: unknown },
) {
  const raw = record(row.input);
  if (!raw || row.mode !== 'V3' || raw.schemaVersion !== '3' || raw.contractVersion !== 3)
    return unable('旧作业版本与输入不一致');
  if (row.status === 'queued' || row.status === 'running')
    return unable('存在待投递或执行中的回测');
  if (raw.inputKind !== undefined || raw.replayOfRunId !== undefined)
    return unable('需要校验净值准备或关联重放身份');

  const definition = convertStrategyDefinition(strategy.schemaVersion, strategy.definition);
  if (!('definition' in definition)) return unable('策略定义需要先处置');
  const input = { ...raw, contractVersion: 1, schemaVersion: tradeRun };
  const base = { ...row, mode: 'frozen', input };
  if (raw.kind === 'preparation-failure') {
    const oldRequest = record(raw.preparation);
    if (oldRequest?.contractVersion !== 3) return unable('失败准备配置版本不一致');
    const preparation = { ...oldRequest, contractVersion: 1 };
    const failure = backtestPreparationFailureInputSchema.safeParse({ ...input, preparation });
    if (!failure.success || !isCurrentRunForRead({ ...base, input: failure.data }))
      return unable('原失败准备配置无法按当前合同读回');
    return { outcome: 'database' as const, row: { ...base, input: failure.data } };
  }
  if (raw.strategyVersionId !== row.strategyVersionId || !record(raw.runConfig) || !record(row.runConfig) ||
      hashCanonicalManifest(raw.runConfig) !== hashCanonicalManifest(row.runConfig))
    return unable('原配置与保存的策略或输入不一致');
  const oldConfig = record(row.runConfig)!;
  const config = convertLegacyTradeRunConfig(oldConfig);
  if ('reason' in config) return config;
  const runConfig = config.runConfig;
  const knownCash = record(oldConfig.knownCashPreparation);
  const knownCashPreparation = runConfig.knownCashPreparation;
  const materialization = record(raw.materialization);
  const oldStrategyHash = hashCanonicalManifest(strategy.definition);
  const strategyVersionHash = hashCanonicalManifest(definition.definition);
  if (materialization &&
      (materialization.kind !== 'configured' || materialization.strategyVersionHash !== oldStrategyHash))
    return unable('物化的策略摘要或运行类型与原定义不一致');
  const configured = {
    ...base, runConfig,
    input: { ...input, runConfig, ...(materialization ? {
      materialization: { ...materialization, strategyVersionHash },
    } : {}) },
  };
  if (!row.snapshotManifest) {
    return isCurrentRunForRead(configured)
      ? { outcome: 'database' as const, row: configured }
      : unable('作业缺少用于核对结果的冻结清单');
  }
  const manifest = record(row.snapshotManifest);
  if (!manifest || manifest.manifestVersion !== 'snapshot-manifest-v3' ||
      manifest.strategyVersionHash !== oldStrategyHash ||
      manifest.runConfigChecksum !== hashCanonicalManifest(row.runConfig) ||
      manifest.contentHash !== hashCanonicalManifest(manifest) ||
      manifest.contentHash !== row.snapshotId || raw.snapshotId !== row.snapshotId ||
      raw.snapshotVersion !== manifest.manifestVersion)
    return unable('旧冻结清单、配置或作业摘要不一致');
  const oldResult = record(row.result);
  if (!oldResult || oldResult.schemaVersion !== '3' ||
      oldResult.snapshotVersion !== manifest.manifestVersion ||
      oldResult.snapshotId !== row.snapshotId || oldResult.contentHash !== row.snapshotId ||
      oldResult.resultChecksum !== row.resultChecksum)
    return unable('旧结果与冻结清单身份不一致');
  const { resultChecksum, ...resultPayload } = oldResult;
  if (deterministicResultChecksum(resultPayload) !== resultChecksum)
    return unable('旧结果摘要无法核验');
  const disclosurePaths = ['publicFeesDisclosure', 'tradingStatusDisclosure'] as const;
  for (const key of disclosurePaths) {
    const disclosure = record(resultPayload[key]);
    const response = record(disclosure?.response);
    if (response?.contractVersion === 3)
      resultPayload[key] = { ...disclosure, response: { ...response, contractVersion: 1 } };
  }
  const knownCashRef = record(manifest.knownCash);
  if (knownCashPreparation) {
    const disclosure = record(resultPayload.knownCashDividendDisclosure);
    if (!knownCashRef || knownCashRef.preparationHash !== knownCash?.contentHash ||
        disclosure?.preparationHash !== knownCash?.contentHash)
      return unable('原快照或回测结果未绑定已知现金准备摘要');
    resultPayload.knownCashDividendDisclosure = { ...disclosure, preparationHash: knownCashPreparation.contentHash };
  }
  const nextManifest = { ...manifest, manifestVersion: tradeManifest,
    strategyVersionHash, runConfigChecksum: hashCanonicalManifest(runConfig),
    ...(knownCashPreparation ? { knownCash: { ...knownCashRef, preparationHash: knownCashPreparation.contentHash } } : {}),
  };
  const snapshotId = hashCanonicalManifest(nextManifest);
  const payload = { ...resultPayload, schemaVersion: tradeResult, snapshotVersion: tradeManifest,
    snapshotId, contentHash: snapshotId };
  const nextChecksum = deterministicResultChecksum(payload);
  const result = backtestResultSchemaV3.safeParse({ ...payload, resultChecksum: nextChecksum });
  if (!result.success)
    return unable('旧结果字段未通过校验：' + result.error.issues.map((issue) => issue.path.join('.') || issue.code).join('、'));
  const candidate = {
    ...configured, snapshotId, snapshotManifest: { ...nextManifest, contentHash: snapshotId },
    input: { ...configured.input, snapshotId, snapshotVersion: tradeManifest },
    result: result.data, resultChecksum: nextChecksum,
  };
  return isCurrentRunForRead(candidate)
    ? { outcome: 'artifacts' as const, row: candidate }
    : unable('冻结结果与当前读取身份校验不一致');
}
