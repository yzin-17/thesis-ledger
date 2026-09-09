import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';

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

export type PortfolioPositionSortKey = 'marketValue' | 'dailyPnl' | 'pnl';
type PortfolioPositionSortDirection = 'asc' | 'desc';

export type PortfolioPositionSort = {
  key: PortfolioPositionSortKey;
  direction: PortfolioPositionSortDirection;
};

export type PortfolioPositionSortState = PortfolioPositionSort | null;

const defaultPositionSort: PortfolioPositionSort = {
  key: 'marketValue',
  direction: 'desc',
};

const positionSortLabels: Record<PortfolioPositionSortKey, string> = {
  marketValue: '市值',
  dailyPnl: '今日收益',
  pnl: '未实现盈亏',
};

const positionSortValue = (position: Position, key: PortfolioPositionSortKey) => {
  if (key === 'marketValue') return positionBaseMarketValue(position);
  if (key === 'dailyPnl') return position.baseDailyPnl ?? position.dailyPnl ?? null;
  return position.basePnl ?? position.pnl;
};

export const sortPortfolioPositions = (
  positions: readonly Position[],
  sort: PortfolioPositionSort = defaultPositionSort,
) =>
  [...positions].sort((left, right) => {
    const leftValue = positionSortValue(left, sort.key);
    const rightValue = positionSortValue(right, sort.key);
    if (leftValue === null || leftValue === undefined) {
      return rightValue === null || rightValue === undefined ? 0 : 1;
    }
    if (rightValue === null || rightValue === undefined) return -1;
    const comparison = leftValue - rightValue;
    if (comparison === 0) return 0;
    return sort.direction === 'asc' ? comparison : -comparison;
  });

export const nextPortfolioPositionSort = (
  current: PortfolioPositionSortState,
  key: PortfolioPositionSortKey,
): PortfolioPositionSortState => {
  if (current === null || current.key !== key) return { key, direction: 'desc' };
  if (current.direction === 'desc') return { key, direction: 'asc' };
  return null;
};

function SortablePositionHeader({
  label,
  sortKey,
  sort,
  isDefault,
  onSort,
}: {
  label: string;
  sortKey: PortfolioPositionSortKey;
  sort: PortfolioPositionSort;
  isDefault: boolean;
  onSort: (key: PortfolioPositionSortKey) => void;
}) {
  const active = sort.key === sortKey;
  let ariaSort: 'none' | 'ascending' | 'descending' = 'none';
  let status = '当前未排序，点击按降序排列';
  if (active) {
    ariaSort = sort.direction === 'asc' ? 'ascending' : 'descending';
    if (isDefault) status = '当前为默认降序，点击进入排序循环';
    else if (sort.direction === 'asc') status = '当前升序，点击恢复默认排序';
    else status = '当前降序，点击切换为升序';
  }
  let SortIcon = ChevronsUpDownIcon;
  if (active && sort.direction === 'asc') SortIcon = ChevronUpIcon;
  else if (active) SortIcon = ChevronDownIcon;
  return (
    <th scope="col" aria-sort={ariaSort}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'h-auto min-h-0 gap-1 px-0 text-xs font-semibold hover:bg-transparent',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        aria-label={`按${label}排序，${status}`}
        title={`按${label}排序`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <SortIcon
          aria-hidden="true"
          className={cn('size-3.5', !active && 'text-muted-foreground/60')}
        />
      </Button>
    </th>
  );
}

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
    detail: `${formatSignedPercent(daily.returnRate)} · 较上一交易日`,
    ...(dailyTone ? { tone: dailyTone } : {}),
  };
};

export function PortfolioSummary({ portfolio }: { portfolio: Portfolio }) {
  const currency = portfolio.baseCurrency ?? 'CNY';
  const securitiesValue = portfolio.totalMarketValue - portfolio.cashValue;
  const daily = dailyMetric(portfolio);
  const cumulativePnl = portfolio.cumulativePnl ?? null;
  const cumulativeTone = tone(cumulativePnl);
  const realizedPnl = portfolio.realizedPnl ?? null;
  const realizedTone = tone(realizedPnl);
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
        label="今日收益"
        value={daily.value}
        detail={daily.detail}
        {...(daily.tone ? { tone: daily.tone } : {})}
      />
      <Metric
        label="累计盈亏"
        value={cumulativePnl === null ? '—' : formatSignedMoney(cumulativePnl, currency)}
        detail={
          portfolio.cumulativePnlRatio === null || portfolio.cumulativePnlRatio === undefined
            ? '已实现 + 未实现暂不可用'
            : `${formatSignedPercent(portfolio.cumulativePnlRatio)} · 已实现 + 未实现`
        }
        {...(cumulativeTone ? { tone: cumulativeTone } : {})}
      />
      <Metric
        label="已实现盈亏"
        value={realizedPnl === null ? '—' : formatSignedMoney(realizedPnl, currency)}
        detail={realizedPnl === null ? '已卖出交易成本暂不可完整确认' : '来自已卖出交易'}
        {...(realizedTone ? { tone: realizedTone } : {})}
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
  const [sort, setSort] = useState<PortfolioPositionSortState>(null);
  const effectiveSort = sort ?? defaultPositionSort;
  const sortedPositions = sortPortfolioPositions(portfolio.positions, effectiveSort);
  const handleSort = (key: PortfolioPositionSortKey) => {
    setSort((current) => nextPortfolioPositionSort(current, key));
  };
  return (
    <section className="panel mt-8 border-t-0">
      <div className="panel-heading">
        <div>
          <h2>当前持仓</h2>
          <p>
            {portfolio.positions.length} 个标的，按{positionSortLabels[effectiveSort.key]}
            {effectiveSort.direction === 'desc' ? '降序' : '升序'}
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标的</th>
              <th>持有</th>
              <th>现价</th>
              <SortablePositionHeader
                label="市值"
                sortKey="marketValue"
                sort={effectiveSort}
                isDefault={sort === null}
                onSort={handleSort}
              />
              <SortablePositionHeader
                label="今日收益"
                sortKey="dailyPnl"
                sort={effectiveSort}
                isDefault={sort === null}
                onSort={handleSort}
              />
              <SortablePositionHeader
                label="未实现盈亏"
                sortKey="pnl"
                sort={effectiveSort}
                isDefault={sort === null}
                onSort={handleSort}
              />
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
