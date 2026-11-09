import { createHash } from 'node:crypto';
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
        [...items].sort((left, right) => {
          // 与 DSA 的身份元组顺序一致；不能拼接带点号的变长代码或使用地区排序。
          for (const field of ['canonicalCode', 'market', 'instrumentType'] as const) {
            if (left[field] < right[field]) return -1;
            if (left[field] > right[field]) return 1;
          }
          return 0;
        }),
      ),
    )
    .digest('hex');

export const CATALOG_TRANSACTION_OPTIONS = {
  isolationLevel: 'Serializable' as const,
  maxWait: 10_000,
  timeout: 60_000,
} as const;
