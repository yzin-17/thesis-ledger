import { ConflictException } from '@nestjs/common';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV3,
  backtestSnapshotManifestV3Schema,
  runConfigSchemaV3,
  type BacktestResultV3,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { asRecord, persistedContractVersion } from './backtest-v3-run-lifecycle.js';

type RunReadRecord = {
  id: string;
  mode: string;
  status: string;
  input: unknown;
  result?: unknown;
  strategyVersionId?: string;
  snapshotId?: string | null;
  resultChecksum?: string | null;
};

type CompleteRunReadRecord = RunReadRecord & {
  runConfig: unknown;
  snapshotManifest: unknown;
};

const unsupported = (): never => {
  throw new ConflictException({
    code: 'UNSUPPORTED_CONTRACT_VERSION',
    message: '回测记录不符合现行读取合同',
  });
};

const matchesFrozenConfiguration = (
  manifest: BacktestSnapshotManifestV3,
  config: RunConfigV3,
): boolean =>
  manifest.status === 'finalized' &&
  manifest.contentHash === hashCanonicalManifest(manifest) &&
  manifest.runConfigChecksum === hashCanonicalManifest(config) &&
  manifest.dataAsOf === config.dataAsOf &&
  manifest.dateRange.startDate === config.startDate &&
  manifest.dateRange.endDate === config.endDate &&
  hashCanonicalManifest(manifest.executionPriceProtocol) ===
    hashCanonicalManifest(config.executionPriceProtocol);

const matchesFrozenModel = (
  manifest: BacktestSnapshotManifestV3,
  config: RunConfigV3,
  result: BacktestResultV3 | undefined,
): boolean => {
  if (!config.executionModel) {
    return !manifest.executionModel && !result?.executionModelDisclosure;
  }
  const hash = hashCanonicalManifest(config.executionModel);
  if (manifest.executionModel?.contentHash !== hash) return false;
  if (!result) return true;
  return (
    result.executionModelDisclosure?.contentHash === hash &&
    hashCanonicalManifest(result.executionModelDisclosure?.model) === hash
  );
};

const matchesFrozenResult = (
  result: BacktestResultV3,
  manifest: BacktestSnapshotManifestV3,
): boolean =>
  result.snapshotId === manifest.contentHash &&
  result.contentHash === manifest.contentHash &&
  result.marketRuleVersion === manifest.marketRuleVersion &&
  result.calendarVersion === manifest.calendarVersion &&
  result.aggregationVersion === manifest.aggregationVersion &&
  result.comparableDataFingerprint === manifest.comparableDataFingerprint &&
  hashCanonicalManifest(result.executionPriceProtocol) ===
    hashCanonicalManifest(manifest.executionPriceProtocol) &&
  hashCanonicalManifest(result.actualSources) === hashCanonicalManifest(manifest.actualSources);

const matchesFrozenRunIdentity = (
  job: RunReadRecord,
  input: Record<string, unknown>,
  manifest: BacktestSnapshotManifestV3,
): boolean =>
  manifest.runId === job.id &&
  (job.strategyVersionId === undefined || manifest.strategyVersionId === job.strategyVersionId) &&
  manifest.contentHash === job.snapshotId &&
  input.snapshotId === job.snapshotId &&
  input.snapshotVersion === manifest.manifestVersion;

/** A list row must not project metrics from an old or malformed result. */
export const isCurrentRunSummaryRecord = (job: RunReadRecord): boolean => {
  if (persistedContractVersion(job) !== 3) return false;
  const input = asRecord(job.input);
  if (!runConfigSchemaV3.safeParse(input?.runConfig).success) return false;
  if (job.result === null || job.result === undefined) return job.status !== 'succeeded';
  if (job.status !== 'succeeded') return false;
  const parsed = backtestResultSchemaV3.safeParse(job.result);
  if (!parsed.success) return false;
  const result = parsed.data;
  const { resultChecksum, ...payload } = result;
  if (deterministicResultChecksum(payload) !== resultChecksum) return false;
  return (
    result.runId === job.id &&
    (job.strategyVersionId === undefined || result.strategyVersionId === job.strategyVersionId) &&
    (job.snapshotId === undefined || result.snapshotId === job.snapshotId) &&
    (job.resultChecksum === undefined || result.resultChecksum === job.resultChecksum)
  );
};

/** Reject persisted old or inconsistent data before the HTTP response is assembled. */
export const assertCurrentRunForRead = (job: CompleteRunReadRecord): void => {
  if (!isCurrentRunSummaryRecord(job)) unsupported();
  const input = asRecord(job.input)!;
  const storedConfig = runConfigSchemaV3.safeParse(job.runConfig);
  const inputConfig = runConfigSchemaV3.safeParse(input.runConfig);
  if (!storedConfig.success || !inputConfig.success) return unsupported();
  if (hashCanonicalManifest(storedConfig.data) !== hashCanonicalManifest(inputConfig.data)) {
    return unsupported();
  }

  if (job.snapshotManifest === null || job.snapshotManifest === undefined) {
    if (
      job.snapshotId !== null ||
      input.snapshotId !== undefined ||
      input.snapshotVersion !== undefined
    ) {
      unsupported();
    }
    return;
  }
  const parsed = backtestSnapshotManifestV3Schema.safeParse(job.snapshotManifest);
  if (!parsed.success) return unsupported();
  const manifest = parsed.data;
  const result =
    job.result === null || job.result === undefined
      ? undefined
      : backtestResultSchemaV3.parse(job.result);
  if (
    !matchesFrozenConfiguration(manifest, storedConfig.data) ||
    !matchesFrozenModel(manifest, storedConfig.data, result) ||
    !matchesFrozenRunIdentity(job, input, manifest) ||
    (result !== undefined && !matchesFrozenResult(result, manifest))
  )
    unsupported();
};

/** 列表与单项使用同一冻结身份门禁，损坏记录不投影指标。 */
export const isCurrentRunForRead = (job: CompleteRunReadRecord): boolean => {
  try {
    assertCurrentRunForRead(job);
    return true;
  } catch {
    return false;
  }
};
