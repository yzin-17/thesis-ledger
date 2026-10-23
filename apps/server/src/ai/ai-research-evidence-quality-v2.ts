import { researchPrivateMaterialV2Schema, type AiFrozenResearchV2 } from '@thesis-ledger/schemas';

const materialRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type Availability = 'usable' | 'empty' | 'unavailable' | 'unknown';
function quoteMaterial(value: Record<string, unknown>): Availability {
  if (!['CNY', 'HKD', 'USD'].includes(String(value.currency))) return 'unknown';
  if (typeof value.price !== 'number' && typeof value.price !== 'string') return 'unknown';
  if (typeof value.price === 'string' && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value.price))
    return 'unknown';
  const price = Number(value.price);
  return Number.isFinite(price) && price > 0 ? 'usable' : 'unknown';
}
function newsMaterial(value: Record<string, unknown>): Availability {
  if (!Array.isArray(value.items) || value.items.length === 0) return 'unknown';
  const known = value.items.every(
    (item) =>
      typeof materialRecord(item).title === 'string' &&
      String(materialRecord(item).title).trim().length > 0,
  );
  return known ? 'usable' : 'unknown';
}
export function qualifyFrozenResearchEvidenceV2(
  entry: AiFrozenResearchV2['evidence'][number],
): Availability {
  if (!entry.usable || entry.status === 'unavailable') return 'unavailable';
  const data = entry.data;
  if (data === null || (Array.isArray(data) && data.length === 0)) return 'empty';
  const value = materialRecord(data);
  if (['unknown', 'unavailable'].includes(String(value.status))) return 'unknown';
  if (['items', 'data'].some((name) => Array.isArray(value[name]) && value[name].length === 0))
    return 'empty';
  if (['unknown', 'unavailable'].includes(String(materialRecord(value.quality).status)))
    return 'unknown';
  if (Object.keys(value).length === 0) return 'unknown';
  if (entry.audit.kind === 'quote') return quoteMaterial(value);
  if (entry.audit.kind === 'news') return newsMaterial(value);
  if (entry.audit.kind === 'portfolio' || entry.audit.kind === 'strategy') {
    const parsed = researchPrivateMaterialV2Schema.safeParse(data);
    if (!parsed.success) return 'unknown';
    if (
      entry.audit.kind === 'portfolio' &&
      parsed.data.version === 'research-portfolio-material-v2'
    )
      return parsed.data.accounts.length ? 'usable' : 'empty';
    if (entry.audit.kind === 'strategy' && parsed.data.version === 'research-strategy-material-v2')
      return 'usable';
  }
  return 'unknown';
}
