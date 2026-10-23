import type {
  MarketDisplayDetailResponse,
  MarketTimeframe,
  MarketDetailRequest,
  MarketDetailCapability,
} from '@thesis-ledger/schemas';
import type { ChartData, ChartLine } from '../../platform/charts/chart-document';
export type MobileInstrument = {
  symbol: string;
  name: string;
  assetType: 'STOCK' | 'ETF' | 'MUTUAL_FUND' | 'INDEX' | 'UNKNOWN';
  market: 'CN' | 'HK' | 'US' | 'UNKNOWN';
};
export function mobileInstrument(input: {
  symbol: string;
  displayName?: string;
  instrumentType?: string;
  market?: string;
}): MobileInstrument {
  const kind = input.instrumentType?.toUpperCase();
  let assetType: MobileInstrument['assetType'] = 'UNKNOWN';
  if (kind === 'ETF') assetType = 'ETF';
  else if (kind === 'INDEX') assetType = 'INDEX';
  else if (kind === 'FUND' || kind === 'MUTUAL_FUND' || input.symbol.endsWith('.OF'))
    assetType = 'MUTUAL_FUND';
  else if (kind === 'STOCK') assetType = 'STOCK';
  let market: MobileInstrument['market'] = 'UNKNOWN';
  if (/\.(SH|SZ|BJ|OF)$/.test(input.symbol)) market = 'CN';
  else if (input.symbol.endsWith('.HK')) market = 'HK';
  else if (input.symbol.endsWith('.US')) market = 'US';
  return { symbol: input.symbol, name: input.displayName ?? input.symbol, assetType, market };
}
export type MarketChartFilters = {
  timeframe: MarketTimeframe;
  adjustment: 'none' | 'qfq' | 'hfq';
  barsLimit: number;
  end: string;
  ma: boolean;
  macd: boolean;
  rsi: boolean;
  maPeriod: string;
  rsiPeriod: string;
  macdFast: string;
  macdSlow: string;
  macdSignal: string;
};
export const marketTimeframes = [
  { value: '1m', label: '分钟' },
  { value: '1d', label: '日线' },
  { value: '5d', label: '五交易日' },
  { value: '1w', label: '周线' },
  { value: '1mo', label: '月线' },
  { value: '1y', label: '年线' },
] as const;
export const marketAdjustments = [
  { value: 'none', label: '不复权' },
  { value: 'qfq', label: '前复权' },
  { value: 'hfq', label: '后复权' },
] as const;
export function marketChartRequest(
  symbol: string,
  filters: MarketChartFilters,
  barsLimit = filters.barsLimit,
  end = filters.end,
): MarketDetailRequest {
  const params: Record<string, number> = {};
  const period = (value: string) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 2 || number > 200)
      throw new Error('指标周期须为 2～200 的整数。');
    return number;
  };
  const include: MarketDetailCapability[] = ['bars'];
  if (filters.ma) {
    include.push('indicator:MA');
    params.period = period(filters.maPeriod);
  }
  if (filters.macd) {
    include.push('indicator:MACD');
    params.macdFast = period(filters.macdFast);
    params.macdSlow = period(filters.macdSlow);
    params.macdSignal = period(filters.macdSignal);
    if (params.macdFast >= params.macdSlow) throw new Error('MACD 快周期必须小于慢周期。');
  }
  if (filters.rsi) {
    include.push('indicator:RSI');
    params.rsiMid = period(filters.rsiPeriod);
  }
  if (!Number.isInteger(barsLimit) || barsLimit < 1 || barsLimit > 3000)
    throw new Error('图表窗口须为 1～3000 根。');
  return {
    symbol,
    timeframe: filters.timeframe,
    adjustment: filters.adjustment,
    barsLimit,
    indicatorParams: params,
    include,
    chartContractVersion: 3,
    ...(end ? { end } : {}),
  };
}
export function marketChartData(
  detail: MarketDisplayDetailResponse,
  filters: Pick<MarketChartFilters, 'ma' | 'macd' | 'rsi'>,
): ChartData {
  const bars = detail.barSeries;
  if (!bars) return { candles: [], lines: [] };
  const lines: ChartLine[] = [];
  for (const name of ['MA', 'MACD', 'RSI'] as const) {
    if (!filters[name.toLowerCase() as keyof typeof filters]) continue;
    const section = detail.sections[`indicator:${name}`];
    if (
      !section ||
      (section.capability !== 'indicator:MA' &&
        section.capability !== 'indicator:MACD' &&
        section.capability !== 'indicator:RSI') ||
      (section.status !== 'ready' && section.status !== 'stale') ||
      !section.data
    )
      continue;
    if (section.data.inputFingerprint !== bars.inputFingerprint)
      throw new Error('指标与当前图表窗口指纹不一致。');
    const keys = [...new Set(section.data.points.flatMap((point) => Object.keys(point.values)))];
    for (const [index, key] of keys.entries()) {
      const values = section.data.points.flatMap((point) => {
        const value = point.values[key];
        return value === null || value === undefined
          ? []
          : [{ time: Math.floor(Date.parse(point.timestamp) / 1000), value }];
      });
      let pane = 0;
      if (name === 'MACD') pane = 1;
      else if (name === 'RSI') {
        pane = 1;
        if (lines.some((line) => line.name.startsWith('MACD:'))) pane = 2;
      }
      lines.push({
        name: `${name}:${key}`,
        values,
        pane,
        style: (index % 3) as 0 | 1 | 2,
        ...(name === 'MACD' && /hist|bar|macd/i.test(key) ? { kind: 'histogram' as const } : {}),
      });
    }
  }
  return {
    candles: bars.points.map((point) => ({
      time: Math.floor(Date.parse(point.timestamp) / 1000),
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    })),
    lines,
  };
}
