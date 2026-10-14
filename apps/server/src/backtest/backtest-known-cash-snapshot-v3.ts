import {
  marketKnownCashControlExchangeV3Schema,
  type BacktestKnownCashPreparationV3,
  type MarketKnownCashControlResponseV3,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { verifyKnownCashPreparationV3 } from './backtest-known-cash-preparation-v3.js';

export const knownCashMetadataKeyV3 = 'metadata/known-cash-preparation-v1.parquet';
export const knownCashRecordsKeyV3 = 'knownCash/events-v1.parquet';
export const knownCashSnapshotVersionV3 = 'known-cash-snapshot-v1';

/** Builder只持有独立资料的冻结上下文；三个围栏均重新校验原包及当前控制。 */
export function knownCashSnapshotContextV3(
  prepared: BacktestKnownCashPreparationV3 | undefined,
  check?: () => Promise<MarketKnownCashControlResponseV3>,
) {
  const manifest: Pick<BacktestSnapshotManifestV3, 'knownCash'> = prepared
    ? {
        knownCash: {
          version: knownCashSnapshotVersionV3,
          preparationHash: prepared.contentHash,
          coverageComplete: false,
        },
      }
    : {};
  const providerRevisions = prepared
    ? { [knownCashRecordsKeyV3]: prepared.input.source.providerRevision }
    : {};
  return {
    manifest,
    providerRevisions,
    async read() {
      if (!prepared) return undefined;
      if (!check) throw new Error('现金准备缺少受信原包/当前控制复核');
      return knownCashSnapshotRowsV3(prepared, prepared.contentHash, await check());
    },
    assertPriceRevisions(evidence: {
      desiredRevision: number;
      effectivePolicyRevision: number;
      catalogRevision: number;
    }) {
      const revisions = prepared?.input.revisions;
      if (
        revisions &&
        (revisions.desiredRevision !== evidence.desiredRevision ||
          revisions.effectivePolicyRevision !== evidence.effectivePolicyRevision ||
          revisions.catalogRevision !== evidence.catalogRevision)
      )
        throw new Error('价格与现金准备控制版本不一致，请重新准备');
    },
  };
}

function verifyControl(
  prepared: BacktestKnownCashPreparationV3,
  response: unknown,
): MarketKnownCashControlResponseV3 {
  const requestId =
    response && typeof response === 'object' && 'requestId' in response
      ? response.requestId
      : undefined;
  return marketKnownCashControlExchangeV3Schema.parse({
    request: {
      ...prepared.acquisition.exchange.request,
      requestId,
      protocolVersion: 'known-cash-control-v1',
      expectedControlIdentity: prepared.input.source.controlIdentity,
    },
    response,
  }).response;
}

/** 独立资料行保留未知覆盖；不会成为旧完整公司行动事实。 */
export function knownCashSnapshotRowsV3(
  value: unknown,
  expectedPreparationHash: string,
  controlResponse: unknown,
): { metadata: ArtifactRow[]; records: ArtifactRow[] } {
  const prepared = verifyKnownCashPreparationV3(value, expectedPreparationHash);
  const control = verifyControl(prepared, controlResponse);
  return {
    metadata: [
      {
        kind: knownCashSnapshotVersionV3,
        preparation: canonicalizeManifest(prepared),
        control: canonicalizeManifest(control),
      },
    ],
    records: [
      {
        kind: 'known-cash-coverage-v1',
        occurredAt: `${prepared.input.scope.startDate}T00:00:00+08:00`,
        complete: false,
        reason: prepared.input.coverage.reason,
        ignoredEmptyRows: prepared.input.ignoredEmptyRows,
        policy: canonicalizeManifest(prepared.input.policy),
        effectiveDate: null,
        record: null,
      },
      ...prepared.input.records.map((record) => ({
        kind: 'known-cash-plan-v1',
        effectiveDate: record.effectiveDate,
        record: canonicalizeManifest(record),
        occurredAt: null,
        complete: null,
        reason: null,
        ignoredEmptyRows: null,
        policy: null,
      })),
    ],
  };
}

/** 准备摘要、复核收据及独立资料行全部离线核对，缺任何部分都失败。 */
export function readKnownCashSnapshotV3(
  metadata: readonly ArtifactRow[],
  records: readonly ArtifactRow[],
  expectedPreparationHash: string,
): { prepared: BacktestKnownCashPreparationV3; control: MarketKnownCashControlResponseV3 } {
  if (metadata.length !== 1 || metadata[0]?.kind !== knownCashSnapshotVersionV3)
    throw new Error('现金快照缺少唯一版本资料');
  const row = metadata[0];
  if (typeof row.preparation !== 'string' || typeof row.control !== 'string')
    throw new Error('现金快照冻结准备或控制资料缺失');
  const prepared = verifyKnownCashPreparationV3(
    JSON.parse(row.preparation),
    expectedPreparationHash,
  );
  const control = verifyControl(prepared, JSON.parse(row.control));
  const expected = knownCashSnapshotRowsV3(prepared, expectedPreparationHash, control);
  if (
    canonicalizeManifest(metadata) !== canonicalizeManifest(expected.metadata) ||
    canonicalizeManifest(records) !== canonicalizeManifest(expected.records)
  )
    throw new Error('现金快照资料与冻结输入不一致');
  return { prepared, control };
}

export function validateKnownCashSnapshotV3(
  expected: BacktestKnownCashPreparationV3 | undefined,
  reference: BacktestSnapshotManifestV3['knownCash'],
  metadata: readonly ArtifactRow[],
  records: readonly ArtifactRow[],
) {
  if (!expected) {
    if (reference || metadata.length || records.length)
      throw new Error('旧快照不能携带未选择的现金资料');
    return undefined;
  }
  if (!reference || reference.preparationHash !== expected.contentHash)
    throw new Error('现金快照版本引用与准备摘要不一致');
  const frozen = readKnownCashSnapshotV3(metadata, records, expected.contentHash);
  if (canonicalizeManifest(frozen.prepared) !== canonicalizeManifest(expected))
    throw new Error('现金快照准备包与冻结RunConfig不一致');
  return frozen;
}
