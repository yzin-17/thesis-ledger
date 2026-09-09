import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { Metric } from '../shared/DesktopPrimitives.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { money } from '../shared/display.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import type { Account, Portfolio, Position } from './portfolio.types.js';

const moneyByCurrency: Record<Account['currency'], Intl.NumberFormat> = {
  CNY: money,
  HKD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }),
  USD: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }),
};

const formatMoney = (value: number, currency: Account['currency'] = 'CNY') =>
  moneyByCurrency[currency].format(value);

const formatSignedMoney = (value: number, currency: Account['currency'] = 'CNY') => {
  const formatted = formatMoney(value, currency);
  return value > 0 ? `+${formatted}` : formatted;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const formatSignedPercent = (value: number) => {
  const formatted = formatPercent(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};

const tone = (value: number | null | undefined) => {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? ('positive' as const) : ('negative' as const);
};

const positionBaseMarketValue = (position: Position) =>
  position.baseMarketValue ?? position.marketValue;

const positionWeight = (position: Position, totalValue: number) => {
  const value = positionBaseMarketValue(position);
  if (value === null || totalValue <= 0) return null;
  return value / totalValue;
};

type MetricPresentation = {
  value: string;
  detail: string;
  tone?: 'positive' | 'negative';
};

const dailyMetric = (portfolio: Portfolio): MetricPresentation => {
  if (portfolio.positions.length === 0) {
    return { value: '—', detail: '暂无证券持仓' };
  }
  const daily = portfolio.dailyChange;
  if (!daily) {
    return { value: '—', detail: '当前数据未包含上一价格' };
  }
  if (daily.partial) {
    const missing = daily.missingSymbols.join('、');
    return {
      value: '—',
      detail: missing ? `${missing} 缺少上一价格` : '今日收益暂不可用',
    };
  }
  if (daily.pnl === null || daily.returnRate === null) {
    return { value: '—', detail: '缺少可用的上一价格' };
  }
  const dailyTone = tone(daily.pnl);
  return {
    value: formatSignedMoney(daily.pnl, portfolio.baseCurrency),
    detail: `${formatSignedPercent(daily.returnRate)} · 按当前持仓与上一价格估算`,
    ...(dailyTone ? { tone: dailyTone } : {}),
  };
};

export function PortfolioSummary({ portfolio }: { portfolio: Portfolio }) {
  const sortedPositions = [...portfolio.positions].sort(
    (left, right) => (positionBaseMarketValue(right) ?? 0) - (positionBaseMarketValue(left) ?? 0),
  );
  const largest = sortedPositions[0];
  const currency = portfolio.baseCurrency ?? 'CNY';
  const securitiesValue = portfolio.totalMarketValue - portfolio.cashValue;
  const cumulativeReturn =
    portfolio.totalCost > 0 ? portfolio.totalPnl / portfolio.totalCost : null;
  const cumulativeTone = tone(portfolio.totalPnl);
  const largestValue = largest ? positionBaseMarketValue(largest) : null;
  const largestWeight = largest ? positionWeight(largest, portfolio.totalMarketValue) : null;
  const daily = dailyMetric(portfolio);
  let largestDetail: string | undefined;
  if (largestValue !== null && largestValue !== undefined) {
    largestDetail = formatMoney(largestValue, currency);
    if (largestWeight !== null) largestDetail += ` · 仓位 ${formatPercent(largestWeight)}`;
  }
  return (
    <section
      className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
      aria-label="组合关键指标"
    >
      <Metric
        label="总资产"
        value={formatMoney(portfolio.totalMarketValue, currency)}
        detail={`证券 ${formatMoney(securitiesValue, currency)} · 现金 ${formatMoney(portfolio.cashValue, currency)}`}
      />
      <Metric
        label="今日持仓收益"
        value={daily.value}
        detail={daily.detail}
        {...(daily.tone ? { tone: daily.tone } : {})}
      />
      <Metric
        label="累计浮盈亏"
        value={formatSignedMoney(portfolio.totalPnl, currency)}
        detail={
          cumulativeReturn === null
            ? '暂无可用持仓成本'
            : `${formatSignedPercent(cumulativeReturn)} · 相对持仓成本`
        }
        {...(cumulativeTone ? { tone: cumulativeTone } : {})}
      />
      <Metric
        label="最大持仓"
        value={largest?.asset.name ?? '—'}
        {...(largestDetail ? { detail: largestDetail } : {})}
      />
    </section>
  );
}

export function PortfolioPositionTable({
  portfolio,
  onSelectPosition,
}: {
  portfolio: Portfolio;
  onSelectPosition: (position: Position) => void;
}) {
  const sortedPositions = [...portfolio.positions].sort(
    (left, right) => (positionBaseMarketValue(right) ?? 0) - (positionBaseMarketValue(left) ?? 0),
  );
  return (
    <section className="panel mt-8 border-t-0">
      <div className="panel-heading">
        <div>
          <h2>当前持仓</h2>
          <p>{portfolio.positions.length} 个标的，按市值排序</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th>持有</th>
              <th>现价</th>
              <th>市值</th>
              <th>今日收益</th>
              <th>累计收益</th>
              <th>状态</th>
              <StickyTableActionHeader>操作</StickyTableActionHeader>
            </tr>
          </thead>
          <tbody>
            {sortedPositions.length === 0 ? (
              <EmptyTableRow colSpan={8} />
            ) : (
              sortedPositions.map((position) => {
                const currency = position.currency ?? portfolio.baseCurrency ?? 'CNY';
                const weight = positionWeight(position, portfolio.totalMarketValue);
                return (
                  <tr key={position.id}>
                    <td>
                      <strong>{position.asset.name}</strong>
                      <span>{position.symbol}</span>
                    </td>
                    <td>
                      <strong>{position.quantity}</strong>
                      <span>成本 {formatMoney(position.costPrice, currency)}</span>
                    </td>
                    <td>
                      <strong>
                        {position.marketPrice === null || position.marketPrice === undefined
                          ? '—'
                          : formatMoney(position.marketPrice, currency)}
                      </strong>
                      <span className={cn(tone(position.dailyReturn))}>
                        {position.dailyReturn === null || position.dailyReturn === undefined
                          ? '今日 —'
                          : `今日 ${formatSignedPercent(position.dailyReturn)}`}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {position.marketValue === null
                          ? '—'
                          : formatMoney(position.marketValue, currency)}
                      </strong>
                      <span>{weight === null ? '仓位 —' : `仓位 ${formatPercent(weight)}`}</span>
                    </td>
                    <td className={cn(tone(position.dailyPnl))}>
                      {position.dailyPnl === null || position.dailyPnl === undefined
                        ? '—'
                        : formatSignedMoney(position.dailyPnl, currency)}
                    </td>
                    <td>
                      <strong className={cn(tone(position.pnl))}>
                        {position.pnl === null ? '—' : formatSignedMoney(position.pnl, currency)}
                      </strong>
                      <span className={cn(tone(position.pnlRatio))}>
                        {position.pnlRatio === null || position.pnlRatio === undefined
                          ? '收益率 —'
                          : formatSignedPercent(position.pnlRatio)}
                      </span>
                    </td>
                    <td>
                      <Badge className={cn('tag', position.stale && 'warning')} variant="secondary">
                        {position.stale ? '陈旧' : '最新'}
                      </Badge>
                    </td>
                    <StickyTableActionCell>
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => onSelectPosition(position)}
                      >
                        行情详情
                      </Button>
                    </StickyTableActionCell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
