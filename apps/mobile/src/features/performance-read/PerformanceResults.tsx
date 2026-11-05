import { useState } from 'react';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { Action, Copy, QueryStatus, Section } from '../../components/MobilePrimitives';
import { MobileChart } from '../../platform/charts/MobileChart';
import { allocationLabels, displayRatio, performanceChartData } from './performance-projection';
import type { usePerformanceQueries } from './performance-queries';
type Results = ReturnType<typeof usePerformanceQueries>;
const fxLabels = {
  disabled: '未合并',
  not_needed: '无需换汇',
  ready: '可用',
  stale: '陈旧',
  blocked: '汇率不可用',
};
const qualityLabels = {
  COMPLETE: '完整',
  PARTIAL: '不完整',
  LOW_COVERAGE: '覆盖不足',
  UNAVAILABLE: '不可用',
};
export function PerformanceResults({ queries }: { queries: Results }) {
  const [limit, setLimit] = useState(30);
  const { summary, history, series, layers, targets, allocation } = queries;
  const data = summary.data;
  const unsupported = series.error instanceof ThesisLedgerApiError ? series.error.payload : null;
  return (
    <>
      <Section title="收益汇总">
        <QueryStatus query={summary} retry={() => void summary.refetch()} />
        {data ? (
          <>
            <Copy>
              时间加权收益 {displayRatio(data.ttwror)}
              {data.ttwrorReason ? ` · ${data.ttwrorReason}` : ''}
            </Copy>
            <Copy>
              资金加权收益 {displayRatio(data.xirr)}
              {data.xirrReason ? ` · ${data.xirrReason}` : ''}
            </Copy>
            <Copy muted>
              汇率状态 {data.fx ? fxLabels[data.fx.status] : '未提供'} · 缺失币种{' '}
              {data.fx?.missingCurrencies.join('、') || '无'}
            </Copy>
          </>
        ) : null}
      </Section>
      <Section title="资产走势">
        <QueryStatus
          query={series}
          empty={series.data?.points.length === 0}
          retry={() => void series.refetch()}
        />
        {unsupported?.availableIntervals && Array.isArray(unsupported.availableIntervals) ? (
          <Copy>当前可用粒度 {unsupported.availableIntervals.join('、')}</Copy>
        ) : null}
        {series.data ? (
          <>
            <Copy muted>
              {series.data.currency} · 质量 {qualityLabels[series.data.dataQuality]} · 历史起点{' '}
              {series.data.historyStart ?? '暂无'}
            </Copy>
            {series.data.points.length ? (
              <MobileChart
                key={`${series.data.range}:${series.data.interval}:${series.data.currency}`}
                data={performanceChartData(series.data)}
              />
            ) : null}
            {series.data.points.slice(-5).map((point) => (
              <Copy key={point.at}>
                {point.at} · {point.value} {point.currency} ·{' '}
                {point.valuationBasis === 'OFFICIAL' ? '正式估值' : '估算'} · 披露覆盖{' '}
                {displayRatio(point.disclosureCoverage)} · 定价覆盖{' '}
                {displayRatio(point.pricedCoverage)}
              </Copy>
            ))}
          </>
        ) : null}
      </Section>
      <Section title="账户与持仓分层">
        <QueryStatus query={layers} retry={() => void layers.refetch()} />
        {layers.data?.dataQuality.partial ? (
          <Copy muted>
            部分估值不可用：{layers.data.dataQuality.missingSymbols.join('、') || '请核对汇率'}
          </Copy>
        ) : null}
        {layers.data?.byCurrency?.map((row, index) => (
          <Copy key={`${row.currency}:${index}`}>
            {row.currency ?? '币种未知'} · 市值 {row.marketValue} · 成本 {row.costValue} · 现金{' '}
            {row.cashValue}
          </Copy>
        ))}
        {layers.data?.account.slice(0, limit).map((row) => (
          <Copy key={row.accountId}>
            账户 {row.accountId} · {row.currency ?? '币种未知'} · 市值 {row.marketValue} · 成本{' '}
            {row.costValue} · 现金 {row.cashValue}
          </Copy>
        ))}
        {layers.data?.security.slice(0, limit).map((row) => (
          <Copy key={`${row.accountId}:${row.symbol}`}>
            {row.symbol} · 成本 {row.costValue} · 市值 {row.marketValue ?? '—'} {row.currency ?? ''}{' '}
            · 浮盈亏 {row.unrealizedPnl ?? '—'}
          </Copy>
        ))}
      </Section>
      <Section title="资产分布与目标差额">
        <QueryStatus query={targets} retry={() => void targets.refetch()} />
        {queries.allocationUnavailable ? (
          <Copy muted>当前范围无法合并估值，请选择单账户或核对汇率。</Copy>
        ) : (
          <QueryStatus query={allocation} retry={() => void allocation.refetch()} />
        )}
        {allocation.data?.partial ? <Copy muted>数据不完整，权重和调整建议暂不可用。</Copy> : null}
        {allocation.data?.allocation.map((row) => (
          <Copy key={row.category}>
            {allocationLabels[row.category]} · {row.value} · 权重 {displayRatio(row.weight)}
          </Copy>
        ))}
        {!allocation.data?.partial && !targets.isError && !layers.isError
          ? allocation.data?.rebalance.map((row) => (
              <Copy key={row.category}>
                {allocationLabels[row.category]} · 目标 {displayRatio(row.targetWeight)} · 差额{' '}
                {row.amountGap} ·{' '}
                {row.direction === 'balanced'
                  ? '已平衡'
                  : `${row.direction === 'increase' ? '增加' : '减少'}配置`}
              </Copy>
            ))
          : null}
      </Section>
      <Section title="收益历史">
        <QueryStatus
          query={history}
          empty={history.data?.length === 0}
          retry={() => void history.refetch()}
        />
        {history.data
          ?.slice()
          .reverse()
          .slice(0, limit)
          .map((row) => (
            <Copy key={row.id}>
              {row.capturedAt} · 市值 {row.marketValue} · 成本 {row.costValue} · 现金{' '}
              {row.cashValue} {row.currency ?? ''}
              {row.payload?.partial || row.payload?.dataQuality?.partial ? ' · 部分数据' : ''}
            </Copy>
          ))}
        <Action label="显示更多收益明细" onPress={() => setLimit((value) => value + 30)} />
      </Section>
    </>
  );
}
