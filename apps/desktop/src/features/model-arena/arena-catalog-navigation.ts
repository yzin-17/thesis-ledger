import { arenaCatalogQuerySchema, type ArenaCatalogQuery } from '@thesis-ledger/schemas';

export function readArenaCatalogParams(params: URLSearchParams): ArenaCatalogQuery {
  const query = arenaCatalogQuerySchema.parse(Object.fromEntries(Object.entries(arenaCatalogQuerySchema.shape).map(([key, schema]) => {
    const result = schema.safeParse(params.get(key) ?? undefined);
    return [key, result.success ? result.data : schema.parse(undefined)];
  })));
  return { ...query, sort: 'created_desc' };
}
export function updateArenaCatalogParams(params: URLSearchParams, patch: Record<string, unknown>) {
  const value = arenaCatalogQuerySchema.parse({ ...readArenaCatalogParams(params), page: 1, ...patch, sort: 'created_desc' });
  const defaults = arenaCatalogQuerySchema.parse({}), next = new URLSearchParams(params);
  for (const key of Object.keys(defaults) as (keyof ArenaCatalogQuery)[]) {
    if (value[key] === defaults[key]) next.delete(key);
    else next.set(key, String(value[key]));
  }
  return next;
}
export function arenaCatalogReturn(state: unknown): string {
  if (!state || typeof state !== 'object' || !('arenaReturn' in state)) return '/arena';
  const path = state.arenaReturn;
  if (typeof path !== 'string' || path.includes('\\') || path.includes('#') ||
      [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '/arena';
  return path === '/arena' || path.startsWith('/arena?') ? path : '/arena';
}
