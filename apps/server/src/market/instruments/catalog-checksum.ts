import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CatalogItem } from '@thesis-ledger/schemas';

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const stableCatalogChecksum = (items: CatalogItem[]) =>
  createHash('sha256')
    .update(
      stableJson(
        [...items].sort((left, right) =>
          `${left.canonicalCode}.${left.market}.${left.instrumentType}`.localeCompare(
            `${right.canonicalCode}.${right.market}.${right.instrumentType}`,
          ),
        ),
      ),
    )
    .digest('hex');

export const CATALOG_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 60_000,
} as const;
