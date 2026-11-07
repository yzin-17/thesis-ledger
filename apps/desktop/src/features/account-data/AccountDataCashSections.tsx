import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { useMemo, useState } from 'react';
import type { LedgerEvent } from '@thesis-ledger/api-client';
import { sumBy } from 'es-toolkit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingState } from '@/components/ui/spinner';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { MoreHorizontalIcon } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import type { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import {
  cashFlowCategoryLabel,
  formatCurrencyAmount,
  formatDate,
  isExecutionEvent,
  supportedCurrency,
} from './account-data.helpers.js';
import type { Currency, ExecutionEvent } from './account-data.types.js';
import { CashTransferSheet } from './AccountDataCashTransferSheet.js';
import { CashDepositSheet } from './AccountDataCashDepositSheet.js';
import { RecurringCashDeposits } from './AccountDataRecurringCashDeposits.js';

type CashSettlementDirection = '应收' | '应付';

export type PendingCashRow = {
  id: string;
  currency: Currency;
  amount: number;
  direction: CashSettlementDirection;
  label: string;
  symbol?: string;
  note?: string;
  settledAt: string;
};

export type SettledCashFlowRow = {
  id: string;
  currency: Currency;
  amount: number;
  direction: '流入' | '流出';
  label: string;
  note?: string;
  settledAt: string;
};

type CashValuation = NonNullable<ReturnType<typeof useAccountValuationQuery>['data']>;
type CashValuationQuery = ReturnType<typeof useAccountValuationQuery>;
import { LedgerContractFailure, ledgerContractRejected } from './account-data.ledger-contract.js';

type QueryLike = {
  error?: unknown;
  data: { events: LedgerEvent[]; ledgerRevision: string } | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const chargeTotal = (event: ExecutionEvent, currency: Currency) =>
  sumBy(event.payload.charges, (charge) => {
    if (charge.currency !== currency) return 0;
    return Number(charge.amount);
  });

const pendingCashTime = (event: LedgerEvent) => {
  if (event.revisionAction === 'VOID') return null;
  if (
    event.type === 'BUY_EXECUTION' ||
    event.type === 'SELL_EXECUTION' ||
    event.type === 'DIVIDEND' ||
    event.type === 'CASH_FLOW'
  )
    return event.payload.settledAt ?? event.payload.expectedAt ?? null;
  return null;
};

const optionalNote = (note: string | undefined) => {
  const trimmed = note?.trim();
  return trimmed ? { note: trimmed } : {};
};

const compareAscending = (left: { settledAt: string }, right: { settledAt: string }) => {
  const difference = new Date(left.settledAt).getTime() - new Date(right.settledAt).getTime();
  return difference || left.settledAt.localeCompare(right.settledAt);
};

const compareDescending = (left: { settledAt: string }, right: { settledAt: string }) =>
  compareAscending(right, left);

export const pendingCash = (events: LedgerEvent[], now = new Date()): PendingCashRow[] => {
  const nowTime = now.getTime();
  const rows: PendingCashRow[] = [];
  for (const event of events) {
    const pendingAt = pendingCashTime(event);
    if (!pendingAt) continue;
    const settled = new Date(pendingAt);
    if (Number.isNaN(settled.getTime()) || settled.getTime() <= nowTime) continue;

    if (isExecutionEvent(event)) {
      const amount = Number(event.payload.quantity) * Number(event.payload.price);
      if (!Number.isFinite(amount)) continue;
      const currency = supportedCurrency(event.payload.currency);
      const total = amount + chargeTotal(event, currency);
      if (!Number.isFinite(total)) continue;
      rows.push({
        id: event.eventId,
        currency,
        amount: total,
        direction: event.type === 'BUY_EXECUTION' ? '应付' : '应收',
        label:
          event.type === 'BUY_EXECUTION'
            ? `买入 ${event.payload.symbol}`
            : `卖出 ${event.payload.symbol}`,
        symbol: event.payload.symbol,
        ...optionalNote(event.payload.note),
        settledAt: pendingAt,
      });
      continue;
    }

    if (event.revisionAction !== 'VOID' && event.type === 'CASH_FLOW') {
      const amount = Number(event.payload.amount);
      if (!Number.isFinite(amount)) continue;
      rows.push({
        id: event.eventId,
        currency: supportedCurrency(event.payload.currency),
        amount,
        direction: event.payload.direction === 'INFLOW' ? '应收' : '应付',
        label: cashFlowCategoryLabel(event.payload.category),
        ...optionalNote(event.payload.note),
        settledAt: pendingAt,
      });
      continue;
    }

    if (event.revisionAction !== 'VOID' && event.type === 'DIVIDEND') {
      const amount = Number(event.payload.amount);
      if (!Number.isFinite(amount)) continue;
      rows.push({
        id: event.eventId,
        currency: supportedCurrency(event.payload.currency),
        amount,
        direction: '应收',
        label: `分红 ${event.payload.symbol}`,
        symbol: event.payload.symbol,
        settledAt: pendingAt,
      });
    }
  }
  return rows.sort(compareAscending);
};

export const settledCashFlows = (events: LedgerEvent[], now = new Date()): SettledCashFlowRow[] => {
  const nowTime = now.getTime();
  const rows: SettledCashFlowRow[] = [];
  for (const event of events) {
    if (event.revisionAction === 'VOID' || event.type !== 'CASH_FLOW') continue;
    const settledAt = event.payload.settledAt ?? event.payload.expectedAt ?? event.occurredAt;
    if (!settledAt) continue;
    const settled = new Date(settledAt);
    const amount = Number(event.payload.amount);
    if (Number.isNaN(settled.getTime()) || settled.getTime() > nowTime || !Number.isFinite(amount))
      continue;
    rows.push({
      id: event.eventId,
      currency: supportedCurrency(event.payload.currency),
      amount,
      direction: event.payload.direction === 'INFLOW' ? '流入' : '流出',
      label: cashFlowCategoryLabel(event.payload.category),
      ...optionalNote(event.payload.note),
      settledAt,
    });
  }
  return rows.sort(compareDescending);
};

export const formatCashShortDate = (value: string | null) => {
  if (!value) return '时间未知';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDate(value);
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${month}/${day}`;
};

export const cashRelativeDateLabel = (value: string, now = new Date()) => {
  const difference = new Date(value).getTime() - now.getTime();
  if (Number.isNaN(difference)) return '时间未知';
  if (difference <= 0) return '今天';
  const days = Math.ceil(difference / DAY_IN_MILLISECONDS);
  if (days === 1) return '明天';
  return `${days} 天后`;
};

export const formatSignedCashAmount = (
  amount: number,
  currency: Currency,
  direction: CashSettlementDirection | SettledCashFlowRow['direction'],
) => {
  const isInflow = direction === '应收' || direction === '流入';
  return `${isInflow ? '+' : '-'}${formatCurrencyAmount(Math.abs(amount), currency)}`;
};

type PendingSummaryRow = {
  currency: Currency;
  amount: number;
  count: number;
};

const pendingSummary = (
  rows: PendingCashRow[],
  direction: CashSettlementDirection,
): PendingSummaryRow[] => {
  const totals = new Map<Currency, PendingSummaryRow>();
  for (const row of rows) {
    if (row.direction !== direction) continue;
    const current = totals.get(row.currency);
    if (current) {
      current.amount += row.amount;
      current.count += 1;
      continue;
    }
    totals.set(row.currency, { currency: row.currency, amount: row.amount, count: 1 });
  }
  return [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency));
};

function CashSummaryMetric({
  title,
  count,
  rows,
  direction,
}: {
  title: string;
  count: number;
  rows: PendingSummaryRow[];
  direction: CashSettlementDirection;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{count} 笔</span>
      </div>
      {rows.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          {rows.map((row) => (
            <div key={row.currency} className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{row.currency}</span>
              <strong className="min-w-0 break-all tabular-nums text-lg font-semibold">
                {formatSignedCashAmount(row.amount, row.currency, direction)}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashOverview({
  account,
  valuation,
  settledRows,
  pendingRows,
  evidencePartial,
}: {
  account: Account;
  valuation: CashValuation | undefined;
  settledRows: Array<{ currency: Currency; amount: number; convertedAmount: number | null }>;
  pendingRows: PendingCashRow[];
  evidencePartial: boolean;
}) {
  const baseCurrency =
    valuation?.baseCurrency ?? (settledRows.length === 1 ? account.currency : null);
  const hasReliableConvertedTotal =
    Boolean(baseCurrency) &&
    settledRows.length > 0 &&
    settledRows.every((row) => row.convertedAmount !== null);
  const convertedTotal = hasReliableConvertedTotal
    ? sumBy(settledRows, (row) => row.convertedAmount ?? 0)
    : null;
  const hasAvailableCash = settledRows.some((row) => row.amount !== 0);
  const receivableRows = pendingSummary(pendingRows, '应收');
  const payableRows = pendingSummary(pendingRows, '应付');

  return (
    <section aria-label="现金余额">
      <div className="flex min-w-0 flex-col gap-4 rounded-md bg-muted/30 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium">可用现金</span>
            <Badge
              variant={evidencePartial ? 'secondary' : 'ghost'}
              className={evidencePartial ? undefined : 'font-normal text-muted-foreground'}
              title="现金证据完整度：根据当前估值与流水读取结果判断。"
            >
              现金数据：{evidencePartial ? '部分' : '完整'}
            </Badge>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            {settledRows.map((row) => (
              <div
                key={row.currency}
                className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"
              >
                <strong className="min-w-0 break-all text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrencyAmount(row.amount, row.currency)}
                </strong>
                <span className="text-xs text-muted-foreground">{row.currency}</span>
              </div>
            ))}
          </div>
          {!hasAvailableCash && <span className="text-xs text-muted-foreground">暂无可用现金</span>}
          {convertedTotal !== null && baseCurrency ? (
            (settledRows.length > 1 || settledRows[0]?.currency !== baseCurrency) && (
              <span className="text-xs text-muted-foreground">
                本位币合计 · {baseCurrency}{' '}
                <strong className="font-medium text-foreground tabular-nums">
                  {formatCurrencyAmount(convertedTotal, baseCurrency)}
                </strong>
              </span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">
              本位币合计暂不可用（缺少可靠汇率）
            </span>
          )}
        </div>
        {pendingRows.length === 0 ? <span className="text-xs text-muted-foreground">暂无待结算资金</span> : <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4">
          <CashSummaryMetric
            title="待结算应收"
            count={pendingRows.filter((row) => row.direction === '应收').length}
            rows={receivableRows}
            direction="应收"
          />
          <CashSummaryMetric
            title="待结算应付"
            count={pendingRows.filter((row) => row.direction === '应付').length}
            rows={payableRows}
            direction="应付"
          />
        </div>}
      </div>
    </section>
  );
}

function PendingCashSection({
  refreshing = false,
  rows,
  resolveInstrumentName,
}: {
  refreshing?: boolean;
  rows: PendingCashRow[];
  resolveInstrumentName: (symbol: string) => string | undefined;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="cash-pending-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="cash-pending-title" className="m-0 text-base font-semibold">
            待结算
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{rows.length} 笔</span>
      </div>
      <ListRefreshRegion refreshing={refreshing} label="正在刷新待结算记录">
        {rows.length > 0 && (
          <div className="divide-y divide-border">
            {rows.map((row) => {
              const instrumentName = row.symbol ? resolveInstrumentName(row.symbol) : undefined;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="row-span-2 flex flex-col gap-1 sm:row-span-1">
                    <strong className="text-sm font-medium">
                      {formatCashShortDate(row.settledAt)}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {cashRelativeDateLabel(row.settledAt)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <strong className="min-w-0 truncate text-sm font-medium">
                        {instrumentName && row.symbol
                          ? row.label.replace(row.symbol, instrumentName)
                          : row.label}
                      </strong>
                      <span className="text-xs text-muted-foreground">{row.currency}</span>
                      {instrumentName && row.symbol && (
                        <span className="text-xs text-muted-foreground">{row.symbol}</span>
                      )}
                    </div>
                    {row.note && (
                      <span className="mt-1 block max-w-[36rem] truncate text-xs text-muted-foreground">
                        备注：{row.note}
                      </span>
                    )}
                  </div>
                  <div className="col-start-2 sm:col-start-auto sm:text-right">
                    <strong className="block whitespace-nowrap tabular-nums text-base font-semibold">
                      {formatSignedCashAmount(row.amount, row.currency, row.direction)}
                    </strong>
                    <span className="text-xs text-muted-foreground">待结算 · {row.direction}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ListRefreshRegion>
    </section>
  );
}

export function RecentCashFlowSection({ rows, refreshing = false }: { rows: SettledCashFlowRow[]; refreshing?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 5);
  const hasMore = rows.length > 5;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="cash-recent-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="cash-recent-title" className="m-0 text-base font-semibold">
            最近流水
          </h3>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            已结算 · 最近 {visibleRows.length} 条
          </p>
        </div>
        {hasMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? '收起' : '查看全部'}
          </Button>
        )}
      </div>
      <ListRefreshRegion refreshing={refreshing} label="正在刷新现金流水">
        {rows.length === 0 ? (
          <Empty className="items-start px-0 py-2">
            <EmptyDescription>暂无现金流水</EmptyDescription>
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {visibleRows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatCashShortDate(row.settledAt)}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="min-w-0 truncate text-sm font-medium">{row.label}</strong>
                    {row.label === '账户间划转' && <span className="text-xs text-muted-foreground">{row.direction === '流入' ? '转入' : '转出'}</span>}
                  </div>
                  {row.note && (
                    <span className="mt-1 block max-w-[36rem] truncate text-xs text-muted-foreground">
                      备注：{row.note}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-right">
                  <span className="text-xs text-muted-foreground">{row.currency}</span>
                  <strong className="block break-all text-sm font-semibold tabular-nums sm:text-base">
                    {formatSignedCashAmount(row.amount, row.currency, row.direction)}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </ListRefreshRegion>
    </section>
  );
}

export function CashSection({
  account,
  accounts,
  valuation,
  valuationQuery,
  events,
  eventsQuery,
  onCalibrate,
  resolveInstrumentName,
}: {
  account: Account;
  accounts: Account[];
  valuation: CashValuation | undefined;
  valuationQuery: CashValuationQuery;
  events: LedgerEvent[];
  eventsQuery: QueryLike;
  onCalibrate: () => void;
  resolveInstrumentName: (symbol: string) => string | undefined;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const canCreateCashDeposit =
    account.type === 'cash' && account.mode === 'actual' && account.active !== false;
  const settledRows = useMemo(() => {
    const rows = valuation?.cashByCurrency ?? [];
    const seen = new Set(rows.map((row) => row.currency));
    if (!seen.has(account.currency)) {
      return [{ currency: account.currency, amount: 0, convertedAmount: null }, ...rows];
    }
    return rows;
  }, [account.currency, valuation?.cashByCurrency]);
  const pendingRows = useMemo(() => pendingCash(events), [events]);
  const settledCashFlowRows = useMemo(() => settledCashFlows(events), [events]);
  const evidencePartial = Boolean(valuation?.dataQuality?.partial) || eventsQuery.isError;

  if (eventsQuery.isError && ledgerContractRejected(eventsQuery.error))
    return <LedgerContractFailure onRetry={eventsQuery.refetch} />;

  return (
    <section className="flex min-w-0 flex-col gap-6" aria-labelledby="account-data-cash-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="account-data-cash-title" className="m-0 text-xl font-semibold">
            现金
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canCreateCashDeposit && (
            <Button type="button" onClick={() => setDepositOpen(true)}>
              现金入账
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTransferOpen(true)}
            disabled={account.mode !== 'actual' || account.active === false}
          >
            账户间划转
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="icon-sm" variant="ghost" aria-label="更多现金操作">
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onCalibrate}>记录现金快照</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CashResults
        eventsRefreshing={eventsQuery.isFetching && !!eventsQuery.data}
        account={account}
        valuation={valuation}
        valuationQuery={valuationQuery}
        settledRows={settledRows}
        pendingRows={pendingRows}
        settledCashFlowRows={settledCashFlowRows}
        evidencePartial={evidencePartial}
        resolveInstrumentName={resolveInstrumentName}
      />
      {(eventsQuery.isError || (valuationQuery.isError && valuationQuery.data)) && (
        <Alert>
          <AlertTitle>现金数据暂未更新</AlertTitle>
          <AlertDescription>
            保留上次成功结果。已成功记录的入账、快照或划转无需再次提交，请重新读取余额与流水。
          </AlertDescription>
          <Button
            aria-busy={eventsQuery.isFetching || valuationQuery.isFetching}
            type="button"
            variant="outline"
            size="sm"
            disabled={eventsQuery.isFetching || valuationQuery.isFetching}
            onClick={() => void Promise.all([eventsQuery.refetch(), valuationQuery.refetch()])}
          >
            重新读取现金数据
          </Button>
        </Alert>
      )}
      <RecurringCashDeposits account={account} />
      <CashTransferSheet
        account={account}
        accounts={accounts}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      {canCreateCashDeposit && (
        <CashDepositSheet account={account} open={depositOpen} onOpenChange={setDepositOpen} />
      )}
    </section>
  );
}

export function CashResults({
  eventsRefreshing = false,
  account,
  valuation,
  valuationQuery,
  settledRows,
  pendingRows,
  settledCashFlowRows,
  evidencePartial,
  resolveInstrumentName,
}: {
  eventsRefreshing?: boolean;
  account: Account;
  valuation: CashValuation | undefined;
  valuationQuery: CashValuationQuery;
  settledRows: Array<{ currency: Currency; amount: number; convertedAmount: number | null }>;
  pendingRows: PendingCashRow[];
  settledCashFlowRows: SettledCashFlowRow[];
  evidencePartial: boolean;
  resolveInstrumentName: (symbol: string) => string | undefined;
}) {
  if (valuationQuery.isPending && !valuation) {
    return <LoadingState label="正在加载现金" />;
  }
  if (valuationQuery.isError && !valuation) {
    return (
      <Alert variant="destructive">
        <AlertTitle>现金读取失败</AlertTitle>
        <AlertDescription>当前余额没有更新，请重新加载账户数据。</AlertDescription>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void valuationQuery.refetch()}
        >
          重新加载
        </Button>
      </Alert>
    );
  }
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <CashOverview
          account={account}
          valuation={valuation}
          settledRows={settledRows}
          pendingRows={pendingRows}
          evidencePartial={evidencePartial}
        />
        <PendingCashSection refreshing={eventsRefreshing} rows={pendingRows} resolveInstrumentName={resolveInstrumentName} />
      </div>
      <RecentCashFlowSection refreshing={eventsRefreshing} rows={settledCashFlowRows} />
    </div>
  );
}
