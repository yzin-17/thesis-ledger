import type {
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
  PortfolioMode,
} from './performance.types.js';

export const defaultIntervals: Record<PerformanceSeriesRange, PerformanceSeriesInterval> = {
  '1D': '1min',
  '5D': '1h',
  '1M': '1d',
  '3M': '1d',
  YTD: '1d',
  '1Y': '1d',
  '5Y': '1mo',
  ALL: '1mo',
};
export const intervalsByRange: Record<
  PerformanceSeriesRange,
  readonly PerformanceSeriesInterval[]
> = {
  '1D': ['1min', '1h'],
  '5D': ['1min', '1h', '1d'],
  '1M': ['1h', '1d', '1w'],
  '3M': ['1h', '1d', '1w', '1mo'],
  YTD: ['1d', '1w', '1mo'],
  '1Y': ['1d', '1w', '1mo'],
  '5Y': ['1w', '1mo', '1y'],
  ALL: ['1mo', '1y'],
};

// Match the server's range/mode contract before a response is available.
export function performanceSeriesSelection(
  range: PerformanceSeriesRange,
  interval: PerformanceSeriesInterval,
  mode: PortfolioMode,
) {
  const effectiveRange = mode === 'shadow' && range === '1D' ? '5D' : range;
  let effectiveInterval = interval;
  if (!intervalsByRange[effectiveRange].includes(effectiveInterval)) {
    effectiveInterval = defaultIntervals[effectiveRange];
  }
  if (mode === 'shadow' && ['1min', '1h'].includes(effectiveInterval)) effectiveInterval = '1d';
  return { range: effectiveRange, interval: effectiveInterval };
}
