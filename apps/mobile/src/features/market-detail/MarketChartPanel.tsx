import { useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { readPlannedMarketDetail, MarketChartUnavailableError } from '@thesis-ledger/api-client';
import type { MarketDisplayBarSeries } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { MobileChart } from '../../platform/charts/MobileChart';
import {
  marketAdjustments,
  marketChartData,
  marketChartRequest,
  type MarketChartFilters,
} from './market-model';
const statuses = {
  ready: '可用',
  stale: '陈旧',
  empty: '暂无数据',
  unsupported: '不支持',
  unavailable: '不可用',
};
function seriesSource(series: MarketDisplayBarSeries) {
  if ('derivation' in series)
    return `派生周期 · 基础来源 ${series.provenance.baseSources.map((row) => `${row.providerId}/${row.upstreamSource}`).join('、')}`;
  return `来源 ${series.provenance.providerId} / ${series.provenance.upstreamSource} · ${series.provenance.cacheStatus === 'stale' ? '陈旧缓存' : '已读取'} · ${series.provenance.fetchedAt}`;
}
export function MarketChartPanel({
  symbol,
  filters,
  onAdjustment,
}: {
  symbol: string;
  filters: MarketChartFilters;
  onAdjustment: (value: MarketChartFilters['adjustment']) => void;
}) {
  const { api, scope } = useMobileRuntime();
  const [limit, setLimit] = useState(filters.barsLimit);
  const anchorEnd = useRef(filters.end);
  const calculationAnchor = useRef<string | undefined>(undefined);
  const forceRefresh = useRef(false);
  const [viewRevision, setViewRevision] = useState(0);
  const query = useQuery({
    queryKey: [...scope, 'market-chart', symbol, filters, limit],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const request = marketChartRequest(symbol, filters, limit, anchorEnd.current);
      const result = await readPlannedMarketDetail(
        api.market,
        {
          ...request,
          ...(forceRefresh.current ? { refresh: true } : {}),
          ...(calculationAnchor.current ? { calculationAnchor: calculationAnchor.current } : {}),
        },
        signal,
      );
      if (signal.aborted) {
        const error = new Error('行情请求已取消');
        error.name = 'AbortError';
        throw error;
      }
      const bars = result.detail.barSeries;
      if (!anchorEnd.current && bars) {
        if ('derivation' in bars) anchorEnd.current = bars.coverage.actualEnd?.slice(0, 10) ?? '';
        else
          anchorEnd.current =
            bars.chartContextV3?.requestedEnd ?? bars.coverage.actualEnd?.slice(0, 10) ?? '';
      }
      if (!calculationAnchor.current) calculationAnchor.current = result.detail.generatedAt;
      return result;
    },
  });
  const detail = query.data?.detail;
  const series = detail?.barSeries;
  const plan =
    query.error instanceof MarketChartUnavailableError ? query.error.plan : query.data?.plan;
  const more = () => {
    if (!query.isFetching && series?.coverage.hasMoreBefore && limit < 3000)
      setLimit((value) => Math.min(3000, value + 60));
  };
  let chart;
  let chartError: string | null = null;
  try {
    if (detail) chart = marketChartData(detail, filters);
  } catch (error) {
    chartError = failureMessage(error);
  }
  return (
    <Section title="行情图表">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {plan ? (
        <Choices
          label="当前窗口可用口径"
          value={filters.adjustment}
          options={marketAdjustments.map((row) => ({
            ...row,
            disabled: !plan.options.find((option) => option.adjustment === row.value)?.available,
          }))}
          onChange={onAdjustment}
          disabled={query.isFetching}
        />
      ) : null}
      {plan?.options
        .filter((option) => !option.available)
        .map((option) => (
          <Copy muted key={option.adjustment}>
            {marketAdjustments.find((row) => row.value === option.adjustment)?.label}暂不可用：
            {option.reason ?? '请核对来源'}
          </Copy>
        ))}
      <Feedback message={chartError} error />
      {chart?.candles.length ? (
        <MobileChart
          key={`${viewRevision}:${chart.lines.map((line) => `${line.name}:${line.pane}:${line.kind}`).join('|')}`}
          data={chart}
          onOlder={more}
        />
      ) : null}
      <Copy>
        当前图表 {series?.points.length ?? 0} 根 · 请求窗口 {limit} 根
      </Copy>
      {chart?.lines.map((line) => (
        <Copy key={line.name}>
          {line.name} · 最新 {line.values.at(-1)?.value ?? '暂无'}
          {line.kind === 'histogram'
            ? ' · 柱形'
            : ` · 线型 ${['实线', '点线', '虚线'][line.style ?? 0]}`}
        </Copy>
      ))}
      {series ? (
        <>
          <Copy muted>{seriesSource(series)}</Copy>
          <Copy muted>
            实际窗口 {series.coverage.actualStart ?? '无'} ～ {series.coverage.actualEnd ?? '无'}
          </Copy>
          {'derivation' in series ? (
            <Copy muted>派生周期 · 基础数据、日历与聚合指纹已由服务端返回。</Copy>
          ) : null}
          {series.points.at(-1) ? (
            <Copy>
              最新开／高／低／收 {series.points.at(-1)!.open} / {series.points.at(-1)!.high} /{' '}
              {series.points.at(-1)!.low} / {series.points.at(-1)!.close} · 成交量{' '}
              {series.points.at(-1)!.volume ?? '未知'}
            </Copy>
          ) : null}
        </>
      ) : null}
      {detail
        ? Object.values(detail.sections).map((section) =>
            section ? (
              <Copy muted key={section.capability}>
                {section.capability.replace('indicator:', '')} · {statuses[section.status]}
                {section.error ? ` · ${section.error.message}` : ''}
              </Copy>
            ) : null,
          )
        : null}
      <Action
        label="读取更早行情"
        disabled={query.isFetching || !series?.coverage.hasMoreBefore || limit >= 3000}
        onPress={more}
      />
      <Action
        label="读取最新行情"
        disabled={query.isFetching}
        onPress={() => {
          anchorEnd.current = filters.end;
          calculationAnchor.current = undefined;
          forceRefresh.current = true;
          void query.refetch().finally(() => {
            forceRefresh.current = false;
            setViewRevision((value) => value + 1);
          });
        }}
      />
      <Action label="复位图表视图" onPress={() => setViewRevision((value) => value + 1)} />
    </Section>
  );
}
