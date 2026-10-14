export type PerformanceSeriesQuality = 'COMPLETE' | 'PARTIAL' | 'LOW_COVERAGE' | 'UNAVAILABLE';

export function aggregatePerformanceSeriesQuality(
  qualities: readonly string[],
): PerformanceSeriesQuality {
  if (qualities.includes('UNAVAILABLE')) return 'UNAVAILABLE';
  if (qualities.includes('LOW_COVERAGE')) return 'LOW_COVERAGE';
  if (qualities.some((quality) => quality !== 'COMPLETE')) return 'PARTIAL';
  return 'COMPLETE';
}
