/**
 * Lightweight Charts reports a negative `barsBefore` when the visible logical
 * range extends into space before the first loaded bar.  Keep that versioned
 * chart-library detail at the market-chart boundary instead of teaching the
 * UI about logical indexes.
 */
export const hasLeftHistoryBlank = (barsBefore: number | null | undefined) =>
  typeof barsBefore === 'number' && barsBefore < 0;
