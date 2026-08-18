const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const hasStaleMarketData = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasStaleMarketData(item, seen));
  const record = value as Record<string, unknown>;
  if (
    record.stale === true ||
    record.freshness === 'stale' ||
    (record.dataQuality &&
      isRecord(record.dataQuality) &&
      (record.dataQuality.partial === true ||
        record.dataQuality.freshness === 'stale' ||
        record.dataQuality.marketData === 'stale' ||
        record.dataQuality.status === 'stale'))
  )
    return true;
  return Object.values(record).some((item) => hasStaleMarketData(item, seen));
};

export const explicitlyAllowsStale = (value: unknown) =>
  isRecord(value) && value.allowStale === true;
