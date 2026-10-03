import { z } from 'zod';

export const catalogItemSchema = z.strictObject({
  canonicalCode: z.string().min(1),
  instrumentType: z.string().min(1),
  market: z.string().min(1),
  displayName: z.string().min(1),
});
const cursorSchema = z.string().regex(/^generation:[1-9]\d*$/);
const snapshot = z.strictObject({
  contractVersion: z.literal(3),
  generation: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  cursor: cursorSchema,
  complete: z.boolean(),
  items: z.array(catalogItemSchema),
});
const key = (item: { canonicalCode: string; market: string; instrumentType: string }) =>
  JSON.stringify([item.canonicalCode, item.market, item.instrumentType]);
const unique = (items: Parameters<typeof key>[0][]) =>
  new Set(items.map(key)).size === items.length;

export const catalogSnapshotSchema = snapshot
  .refine(
    (value) => value.cursor === `generation:${value.generation}`,
    '目录游标与 generation 不匹配',
  )
  .refine((value) => unique(value.items), '目录条目身份重复');
export const catalogDeltaSchema = snapshot
  .extend({
    fromCursor: cursorSchema,
    deleted: z.array(
      catalogItemSchema.pick({ canonicalCode: true, instrumentType: true, market: true }),
    ),
    requiresFullSnapshot: z.boolean().optional(),
  })
  .refine(
    (value) => value.cursor === `generation:${value.generation}`,
    '目录游标与 generation 不匹配',
  )
  .refine(
    (value) => Number(value.fromCursor.split(':')[1]) <= value.generation,
    '目录增量游标不得倒退',
  )
  .refine((value) => {
    const updated = new Set(value.items.map(key));
    return (
      updated.size === value.items.length &&
      unique(value.deleted) &&
      !value.deleted.some((item) => updated.has(key(item)))
    );
  }, '目录增量身份重复或冲突');

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type CatalogDelta = z.infer<typeof catalogDeltaSchema>;
