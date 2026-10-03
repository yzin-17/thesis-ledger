import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BacktestNavSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { canonicalizeManifest, SnapshotIntegrityError } from './backtest-snapshot.js';
import type { NavFrozenContext } from './backtest-nav-freeze-validation.js';

export const hashNavRaw = (raw: string): string => createHash('sha256').update(raw).digest('hex');
export function navIntegrityFailure(message: string): never {
  throw new SnapshotIntegrityError(message);
}

const recordSchema = z
  .object({
    sourceRecordId: z.string().min(1),
    symbol: z.string(),
    valuationDate: z.iso.date(),
    nav: z.string(),
    sourcePublishedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .passthrough();

const responseRecords = (raw: string): Set<string> => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    navIntegrityFailure('NAV 来源响应原文不是有效 JSON');
  }
  const records = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const object = node as Record<string, unknown>;
    if (typeof object.sourceRecordId === 'string') records.add(canonicalizeManifest(object));
    Object.values(object).forEach(visit);
  };
  visit(value);
  return records;
};

/** 严格模式核验真实发布字段；研究模式只核验来源净值身份与原文。 */
export const validateNavSourceRecords = (
  manifest: Pick<BacktestNavSnapshotManifestV3, 'facts'>,
  context: NavFrozenContext,
): void => {
  if (context.publicationRecords.length !== manifest.facts.length)
    navIntegrityFailure('NAV 来源记录覆盖不完整');
  const records = new Map<string, string>();
  const response = responseRecords(context.responseRaw);
  for (const record of context.publicationRecords) {
    if (records.has(record.sourceRecordId)) navIntegrityFailure('NAV 来源记录重复');
    records.set(record.sourceRecordId, record.rawRecord);
  }
  for (const fact of manifest.facts) {
    const proof = fact.publicationEvidence;
    const raw = records.get(proof.sourceRecordId);
    if (!raw || hashNavRaw(raw) !== proof.rawRecordHash)
      navIntegrityFailure('NAV 来源原文缺失或摘要不符');
    let record: z.infer<typeof recordSchema>;
    try {
      record = recordSchema.parse(JSON.parse(raw));
    } catch {
      navIntegrityFailure('NAV 来源原文缺少可核验字段');
    }
    if (!response.has(canonicalizeManifest(record)))
      navIntegrityFailure('NAV 来源记录不属于冻结来源响应');
    if (
      record.sourceRecordId !== proof.sourceRecordId ||
      record.symbol !== fact.symbol ||
      record.valuationDate !== fact.valuationDate ||
      record.nav !== fact.nav ||
      (proof.kind === 'source-publication-record' &&
        record.sourcePublishedAt !== proof.sourcePublishedAt)
    ) {
      navIntegrityFailure('NAV 原始记录与净值或发布时间不符');
    }
  }
};
