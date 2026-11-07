import { Spinner } from '@/components/ui/spinner';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isMarketMinuteTimeframe, type MarketTimeframe } from '@thesis-ledger/schemas';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';

export type ChartPeriod = MarketTimeframe;
export const marketPeriodLabels: Record<ChartPeriod, string> = {
  '1m': '1 分钟',
  '5m': '5 分钟', '15m': '15 分钟', '30m': '30 分钟', '60m': '60 分钟',
  '1d': '日线', '5d': '5 日线', '1w': '周线', '1mo': '月线', '1y': '年线',
};
const periods = Object.keys(marketPeriodLabels) as ChartPeriod[];
export const marketPeriodPreferenceKey = 'thesis-ledger:market-period-preference';
const keyFor = (symbol: string) => `thesis-ledger:market-period:${symbol}`;
export function readMarketPeriod(symbol: string): ChartPeriod {
  try {
    const value = window.localStorage.getItem(marketPeriodPreferenceKey)
      ?? window.localStorage.getItem(keyFor(symbol));
    if (periods.includes(value as ChartPeriod)) return value as ChartPeriod;
  } catch { /* 存储不可用时使用日线。 */ }
  return '1d';
}
function savePeriod(value: ChartPeriod) {
  try { window.localStorage.setItem(marketPeriodPreferenceKey, value); } catch { /* 会话选择仍可用。 */ }
}
const PeriodContext = createContext<ReactNode>(null);
const PeriodNoticeContext = createContext<ReactNode>(null);
const PeriodDataReadyContext = createContext(true);
export const useMarketPeriodControls = () => useContext(PeriodContext);
export const useMarketPeriodNotice = () => useContext(PeriodNoticeContext);
export const useMarketPeriodDataReady = () => useContext(PeriodDataReadyContext);

export function MarketPeriodSelection({ symbol, enabled, adjustment, children }: {
  symbol: string;
  enabled: boolean;
  adjustment?: 'none' | 'qfq' | 'hfq';
  children: (period: ChartPeriod) => ReactNode;
}) {
  const [selection, setSelection] = useState(() => ({ symbol, value: readMarketPeriod(symbol) }));
  const [notice, setNotice] = useState<{ symbol: string; text: string } | null>(null);
  const selected = selection.symbol === symbol ? selection.value : readMarketPeriod(symbol);
  const optionsQuery = (barsLimit: number) => ({
    queryKey: ['desktop', 'market-period-options', symbol, adjustment ?? 'qfq', barsLimit],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getDesktopApiClient().market.getPeriodOptions(symbol, {
        adjustment: adjustment ?? 'qfq', barsLimit, signal,
      }),
    enabled: enabled && /\.(SH|SZ|BJ)$/.test(symbol),
    staleTime: 60_000,
    retry: false,
  });
  const standardQuery = useQuery(optionsQuery(90));
  const annualQuery = useQuery(optionsQuery(2));
  const minuteMarket = /\.(HK|US)$/.test(symbol);
  const minuteQuery = useQuery({
    queryKey: ['desktop', 'market-minute-options', symbol, '1m'],
    queryFn: ({ signal }) => getDesktopApiClient().market.getChartOptions(symbol, signal, undefined, '1m'),
    enabled: enabled && minuteMarket,
    staleTime: 15_000,
    retry: false,
  });
  const derivedMinuteQuery = useQuery({
    queryKey: ['desktop', 'market-derived-minute-options', symbol, 90],
    queryFn: ({ signal }) => getDesktopApiClient().market.getMinuteOptions(symbol, { barsLimit: 90, signal }),
    enabled: enabled && minuteMarket,
    staleTime: 15_000,
    retry: false,
  });
  const query = selected === '1y' ? annualQuery : standardQuery;
  const available = new Set<ChartPeriod>(['1d']);
  if (minuteQuery.data?.symbol === symbol && minuteQuery.data.timeframe === '1m' &&
      minuteQuery.data.options.some((option) => option.adjustment === 'none' && option.available)) available.add('1m');
  if (derivedMinuteQuery.data?.version === 'market-minute-options-v1' && derivedMinuteQuery.data.symbol === symbol)
    for (const option of derivedMinuteQuery.data.options)
      if (option.available) available.add(option.timeframe);
  for (const option of standardQuery.data?.options ?? []) {
    if (option.timeframe !== '1y' && option.available) available.add(option.timeframe);
  }
  if (annualQuery.data?.options.some((option) => option.timeframe === '1y' && option.available)) {
    available.add('1y');
  }
  let ready = query.isSuccess;
  if (selected === '1m') ready = !minuteMarket || minuteQuery.isSuccess;
  else if (isMarketMinuteTimeframe(selected)) ready = !minuteMarket || derivedMinuteQuery.isSuccess;
  const unavailable = enabled && selected !== '1d' && ready && !available.has(selected);
  const waitingMinute = enabled && minuteMarket && isMarketMinuteTimeframe(selected) && !ready;
  const minuteReadiness = selected === '1m' ? minuteQuery : derivedMinuteQuery;
  const period = enabled && !unavailable ? selected : '1d';
  useEffect(() => {
    if (!unavailable) return;
    setNotice({ symbol, text: `${marketPeriodLabels[selected]}当前不可用，已切换为日线。` });
    setSelection({ symbol, value: '1d' });
    savePeriod('1d');
  }, [unavailable, selected, symbol]);
  const select = (value: ChartPeriod) => {
    if (!available.has(value)) return;
    setSelection({ symbol, value });
    setNotice(null);
    savePeriod(value);
  };
  const controls = enabled ? (
    <>
      <ToggleGroup aria-label="行情周期" value={[period]} onValueChange={(value) => {
        if (value[0] && periods.includes(value[0] as ChartPeriod)) select(value[0] as ChartPeriod);
      }}>
        {periods.filter((value) => available.has(value)).map((value) => (
          <ToggleGroupItem key={value} value={value}>{marketPeriodLabels[value]}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  ) : null;
  let periodNotice: ReactNode = null;
  if (waitingMinute && minuteReadiness.isError) {
    periodNotice = <Alert role="status"><AlertDescription>
      分钟周期暂时无法确认，请重试或选择日线。
      <Button size="sm" variant="outline" onClick={() => void minuteReadiness.refetch()}>重试周期能力</Button>
    </AlertDescription></Alert>;
  } else if (waitingMinute) {
    periodNotice = <Alert role="status"><Spinner aria-hidden="true" /><AlertDescription>正在确认分钟周期…</AlertDescription></Alert>;
  } else if (notice?.symbol === symbol) {
    periodNotice = <Alert role="status"><AlertDescription>{notice.text}</AlertDescription></Alert>;
  }
  return <PeriodContext.Provider value={controls}>
    <PeriodNoticeContext.Provider value={periodNotice}>
      <PeriodDataReadyContext.Provider value={!waitingMinute}>{children(period)}</PeriodDataReadyContext.Provider>
    </PeriodNoticeContext.Provider>
  </PeriodContext.Provider>;
}
