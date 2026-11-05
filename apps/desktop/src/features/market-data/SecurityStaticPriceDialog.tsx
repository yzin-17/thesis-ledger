import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { SecurityStaticInfoResponse } from '@thesis-ledger/schemas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { LightweightMarketChart } from '../market-detail/MarketPriceLightweightChart.js';
import { MarketChartAttribution } from '../market-detail/MarketChartAttribution.js';
import { chartBarsFromSeries } from '../market-detail/market-chart-types.js';
import { chartCursorForKey, chartPointKey, formatChartBarTime } from '../market-detail/market-chart-time.js';
import { fetchSecurityStaticQuote } from './security-static-info.api.js';

const periods = ['1d', '1m'] as const;
const labels = { '1d': '日线', '1m': '1 分钟' };
const adjustments = ['none', 'qfq', 'hfq'] as const;
const adjustmentLabels = { none: '不复权', qfq: '前复权', hfq: '后复权' };
const format = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

export function SecurityStaticPriceDialog({ info, onClose }: {
  info: SecurityStaticInfoResponse; onClose: () => void;
}) {
  const [timeframe, setTimeframe] = useState<'1d' | '1m'>('1d');
  const [dailyAdjustment, setDailyAdjustment] = useState<typeof adjustments[number]>('none');
  const adjustment = timeframe === '1m' ? 'none' : dailyAdjustment;
  const [hover, setHover] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const client = getDesktopApiClient();
  const rootKey = ['desktop', 'security-static-price', info.symbol, info.assetType];
  const plans = useQueries({ queries: periods.map(period => ({
    queryKey: [...rootKey, 'plan', period],
    queryFn: ({ signal }: { signal: AbortSignal }) => client.market.getPlannedChartOptions(info.symbol,
      { barsLimit: 180, indicatorParams: {}, timeframe: period, assetType: info.assetType }, signal),
    retry: false, staleTime: 15_000, refetchOnWindowFocus: false,
  })) });
  const selectedPlan = plans[timeframe === '1d' ? 0 : 1];
  const plan = selectedPlan?.data;
  const available = plan?.options.some(option => option.adjustment === adjustment && option.available) === true;
  const series = useQuery({
    queryKey: [...rootKey, 'bars', timeframe, adjustment, plan?.window],
    queryFn: async ({ signal }) => {
      if (!plan?.window || !available) throw new Error('当前图表价格口径不可用');
      const result = await client.market.getBars(info.symbol, { assetType: info.assetType, timeframe,
        adjustment, ...plan.window, refresh: true, signal });
      if ('derivation' in result) throw new Error('当前原生图表返回了派生周期');
      return result;
    },
    enabled: Boolean(plan?.window && available), retry: false, staleTime: 15_000, refetchOnWindowFocus: false,
  });
  const quote = useQuery({
    queryKey: [...rootKey, 'quote'],
    queryFn: ({ signal }) => fetchSecurityStaticQuote(info.symbol, info.assetType, signal),
    retry: false, staleTime: 15_000, refetchOnWindowFocus: false,
  });
  const bars = series.data ? chartBarsFromSeries(series.data) : [];
  const selected = bars.find(bar => chartPointKey(bar.timestamp, bar.timeframe) === (locked ?? hover)) ?? bars.at(-1);
  const chartError = selectedPlan?.error ?? series.error;
  const unavailable = selectedPlan?.isSuccess && !available;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{info.name ?? info.symbol} · 行情</DialogTitle>
        <DialogDescription>{info.symbol} · {info.assetType === 'ETF' ? 'ETF' : '股票'} · 当前证券资料</DialogDescription>
      </DialogHeader>
      <section aria-label="当前报价" className="flex flex-wrap items-center gap-3 text-sm">
        {quote.data && <>
          <strong>最新价 {format.format(quote.data.price)} {quote.data.units?.priceCurrency ?? ''}</strong>
          <span>{quote.data.provider === 'futu' ? '富途 OpenAPI' : quote.data.provider}</span>
          <span>行情时间 {quote.data.marketTime ? new Date(quote.data.marketTime).toLocaleString('zh-CN') : '未知'}</span>
          {quote.data.stale && <span>缓存行情</span>}
        </>}
        {quote.isPending && <span role="status">正在读取报价…</span>}
        {quote.error && <span role="alert">报价暂时无法读取，请检查来源配置或稍后刷新。</span>}
        <Button variant="outline" size="sm" disabled={quote.isFetching || series.isFetching}
          onClick={() => { void quote.refetch(); if (available) void series.refetch(); }}>刷新行情</Button>
      </section>
      <ToggleGroup aria-label="行情周期" value={[timeframe]} onValueChange={value => {
        if (value[0] === '1d' || value[0] === '1m') { setTimeframe(value[0]); setHover(null); setLocked(null); }
      }}>
        {periods.filter((period, index) => period === '1d' || period === timeframe ||
          plans[index]?.data?.options.some(option => option.adjustment === 'none' && option.available))
          .map(period => <ToggleGroupItem key={period} value={period}>{labels[period]}</ToggleGroupItem>)}
      </ToggleGroup>
      {timeframe === '1d' && <ToggleGroup aria-label="价格口径" value={[dailyAdjustment]} onValueChange={value => {
        if (value[0] === 'none' || value[0] === 'qfq' || value[0] === 'hfq') setDailyAdjustment(value[0]);
      }}>{adjustments.map(value => <ToggleGroupItem key={value} value={value}
        disabled={!plan?.options.some(option => option.adjustment === value && option.available)}>
        {adjustmentLabels[value]}
      </ToggleGroupItem>)}</ToggleGroup>}
      <p className="text-sm text-muted-foreground">{adjustmentLabels[adjustment]}{timeframe === '1m' ? ' · 正常交易时段' : ''}</p>
      {(chartError || unavailable) && <Alert variant="destructive"><AlertTitle>图表未读取</AlertTitle>
        <AlertDescription>{chartError ? '当前图表暂时不可用，请检查来源配置或稍后重试。' :
          `当前未配置可用的${adjustmentLabels[adjustment]}价格来源。`}</AlertDescription></Alert>}
      {(selectedPlan?.isPending || series.isFetching) && <p role="status">正在读取图表…</p>}
      {series.data && <p className="text-sm text-muted-foreground">
        {series.isError ? '上次成功加载' : '已加载'} {bars.length} 点 · {plan?.window?.start} 至 {plan?.window?.end} ·
        来源 {series.data.provenance.providerId === 'futu' ? '富途 OpenAPI' : series.data.provenance.providerId}
      </p>}
      {selected && <p aria-label="行情读数" className="text-sm tabular-nums">
        {formatChartBarTime(selected)} · 开 {format.format(selected.open)} · 高 {format.format(selected.high)} ·
        低 {format.format(selected.low)} · 收 {format.format(selected.close)} · 量 {selected.volume === null ? '未知' : format.format(selected.volume)}
        {timeframe === '1m' && selected.completionStatus === 'incomplete' && ' · 形成中'}
        {timeframe === '1m' && selected.completionStatus === 'unknown' && ' · 完整性未知'}
      </p>}
      {bars.length > 0 && <div role="group" aria-label="价格与成交量图表，左右键逐点查看" tabIndex={0}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onKeyDown={event => {
          const next = chartCursorForKey(bars, locked ?? hover, event.key);
          if (next !== undefined) { event.preventDefault(); setLocked(next); }
        }}>
        <LightweightMarketChart key={`${info.symbol}:${timeframe}:${adjustment}`} bars={bars} indicators={[]}
          visibleRange={90} chartMode="candles" activePane="MACD" visibleIndicators={[]} visibleMA={[]}
          rsiPeriod={6} showBothPanes={false} focusLatestRevision={0} resetRevision={0}
          onHover={setHover} onClick={value => setLocked(current => current === value ? null : value)} lockedTimestamp={locked} />
      </div>}
      <MarketChartAttribution />
    </DialogContent>
  </Dialog>;
}
