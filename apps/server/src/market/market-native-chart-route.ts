import { marketChartRequest } from './market-chart-request.js';
import type { MarketChartReaderV3 } from './market-chart-reader-v3.js';

/** 已配置的原生分钟优先；没有原生路由时保留既有分钟聚合入口。 */
export async function hasNativeChartRoute(
  reader: MarketChartReaderV3 | undefined,
  symbol: string,
  timeframe: string,
  assetType?: string,
) {
  if (timeframe === '1d' || timeframe === '1m') return true;
  if (!reader || !['5m', '15m', '30m', '60m'].includes(timeframe)) return false;
  const { identity } = marketChartRequest(symbol, { assetType, timeframe, adjustment: 'none' });
  const options = await reader.options(identity);
  return options.options.some((option) => option.adjustment === 'none' && option.available);
}
