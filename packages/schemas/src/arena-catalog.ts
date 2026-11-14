import { z } from 'zod';

export const arenaCatalogQuerySchema = z.strictObject({
  search: z.string().trim().max(200).default(''),
  kind: z.enum(['all', 'live', 'history']).default('all'),
  market: z.enum(['all', 'CN', 'HK', 'US']).default('all'),
  state: z.enum(['all', 'draft', 'running', 'paused', 'ended']).default('all'),
  sort: z.enum(['created_desc', 'created_asc', 'title', 'season_desc']).default('created_desc'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().refine((value) => [10, 25, 50].includes(value), '每页数量无效').default(25),
});
export type ArenaCatalogQuery = z.infer<typeof arenaCatalogQuerySchema>;
export type ArenaCatalogQueryInput = z.input<typeof arenaCatalogQuerySchema>;
export const arenaCatalogItemSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(['live', 'history']), title: z.string().min(1),
  market: z.enum(['CN', 'HK', 'US']), state: z.enum(['draft', 'running', 'paused', 'ended']),
  startsOn: z.iso.date().nullable(), endsOn: z.iso.date().nullable(), createdAt: z.iso.datetime(),
  models: z.array(z.strictObject({ providerId: z.string(), model: z.string() })),
});
export type ArenaCatalogItem = z.infer<typeof arenaCatalogItemSchema>;
export const arenaCatalogResultSchema = z.strictObject({
  items: z.array(arenaCatalogItemSchema).max(50), total: z.number().int().nonnegative(),
  totalUnfiltered: z.number().int().nonnegative(), page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type ArenaCatalogResult = z.infer<typeof arenaCatalogResultSchema>;
