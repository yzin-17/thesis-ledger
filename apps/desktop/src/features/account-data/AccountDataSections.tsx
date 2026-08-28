import { useMemo } from 'react';
import type { LedgerEventV2 } from '@thesis-ledger/api-client';
import { sumBy } from 'es-toolkit';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import type { Account, Position } from '../portfolio/portfolio.types.js';
import type { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import {
  eventTypeLabel,
  executionSideLabel,
  formatCurrencyAmount,
  formatDate,
  formatDecimal,
  isExecutionEvent,
  revisionBadgeVariant,
  revisionLabel,
  supportedCurrency,
  transactionAmount,
  transactionFilters,
} from './account-data.helpers.js';
import type { ExecutionEvent, Currency } from './account-data.types.js';
import type { AccountDataEventFilter } from './account-data.queries.js';

type QueryLike = {
  data: { events: LedgerEventV2[]; ledgerRevision: string } | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

export function TransactionSection({
  account,
  events,
  query,
  filter,
  onFilterChange,
  onCreate,
  onCorrect,
  onVoid,
  onAudit,
  onOpenImport,
  onOpenReconciliation,
}: {
  account: Account;
  events: LedgerEventV2[];
  query: QueryLike;
  filter: AccountDataEventFilter;
  onFilterChange: (filter: AccountDataEventFilter) => void;
  onCreate: () => void;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onAudit: (event: LedgerEventV2) => void;
  onOpenImport: () => void;
  onOpenReconciliation: () => void;
}) {
  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    const execution = isExecutionEvent(event);
    return filter === 'executions' ? execution : !execution;
  });
  const emptyTitle = filter === 'executions' ? '暂无成交记录' : '暂无其他账本事件';
  return (
    <section className="flex flex-col gap-4" aria-labelledby="account-data-transactions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="account-data-transactions-title" className="m-0 text-xl font-semibold">
            成交记录
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            这里显示当前有效版本；修正链保留在审计 Sheet 中，不会重复计数。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCreate} disabled={account.type === 'cash'}>
            录入成交
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenImport}
            disabled={account.type === 'cash'}
          >
            ImportDraft
          </Button>
          <Button type="button" variant="outline" onClick={onOpenReconciliation}>
            打开对账
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          value={[filter]}
          aria-label="账本事件筛选"
          onValueChange={(value) => {
            const next = value[0] as AccountDataEventFilter | undefined;
            if (next) onFilterChange(next);
          }}
        >
          {transactionFilters.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {query.isFetching && query.data && <Badge variant="secondary">正在更新</Badge>}
      </div>
      <TransactionResults
        query={query}
        filter={filter}
        emptyTitle={emptyTitle}
        filteredEvents={filteredEvents}
        onCorrect={onCorrect}
        onVoid={onVoid}
        onAudit={onAudit}
      />
      {query.isError && query.data && (
        <Alert>
          <AlertTitle>显示的是上次成功读取的结果</AlertTitle>
          <AlertDescription>
            本次刷新失败。你可以继续查看，但提交修正前应重新加载最新账本版本。
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function TransactionResults({
  query,
  filter,
  emptyTitle,
  filteredEvents,
  onCorrect,
  onVoid,
  onAudit,
}: {
  query: QueryLike;
  filter: AccountDataEventFilter;
  emptyTitle: string;
  filteredEvents: LedgerEventV2[];
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onAudit: (event: LedgerEventV2) => void;
}) {
  if (query.isPending && !query.data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在加载成交记录">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>账本读取失败</AlertTitle>
        <AlertDescription>当前成交列表未更新，请重试；已有表单输入不会被清除。</AlertDescription>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          重新加载
        </Button>
      </Alert>
    );
  }
  if (filteredEvents.length === 0) {
    const emptyDescription =
      filter === 'executions'
        ? '录入第一笔真实成交后，BUY/SELL 会在这里按当前有效版本展示。'
        : 'Baseline、余额观察、公司行动、分红和现金流会在产生后显示。';
    return (
      <Empty className="min-h-56 rounded-xl border bg-card p-8">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[900px] text-left text-sm">
        <caption className="sr-only">{emptyTitle}</caption>
        <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">事实</th>
            <th className="px-4 py-3 font-medium">时间</th>
            <th className="px-4 py-3 font-medium">金额/数量</th>
            <th className="px-4 py-3 font-medium">来源与状态</th>
            <th className="px-4 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filteredEvents.map((event) => (
            <TransactionRow
              key={event.eventId}
              event={event}
              onCorrect={onCorrect}
              onVoid={onVoid}
              onAudit={onAudit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionRow({
  event,
  onCorrect,
  onVoid,
  onAudit,
}: {
  event: LedgerEventV2;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onAudit: (event: LedgerEventV2) => void;
}) {
  const execution = isExecutionEvent(event);
  const title = execution ? event.payload.symbol : eventTypeLabel(event);
  const detail = execution
    ? `${executionSideLabel(event)} · ${formatDecimal(event.payload.quantity)} · ${formatDecimal(event.payload.price)} ${event.payload.currency}`
    : `Revision ${event.ledgerRevision} · ${event.source.channel}`;
  const amount = transactionAmount(event, execution ? event : null);
  return (
    <tr data-ledger-event-id={event.eventId}>
      <td className="max-w-[240px] px-4 py-3 align-top">
        <strong className="block truncate font-medium">{title}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
        {formatDate(event.occurredAt)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-muted-foreground">
        {amount}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={revisionBadgeVariant(event)}>{revisionLabel(event)}</Badge>
          <span className="text-xs text-muted-foreground">{event.source.channel}</span>
        </div>
        <span className="mt-1 block text-xs text-muted-foreground">
          {event.source.sourceRowId ? `来源行 ${event.source.sourceRowId}` : '来源行未提供'}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap justify-end gap-1">
          {execution && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => onCorrect(event)}>
                更正
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => onVoid(event)}>
                作废
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => onAudit(event)}>
            查看修正链
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function PositionCalibrationSection({
  account,
  accounts,
  positions,
  cashValue,
  valuationQuery,
  onDirtyChange,
  onSaved,
  onOpenImport,
  onOpenReconciliation,
}: {
  account: Account;
  accounts: Account[];
  positions: Position[];
  cashValue: number;
  valuationQuery: ReturnType<typeof useAccountValuationQuery>;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onOpenImport: () => void;
  onOpenReconciliation: () => void;
}) {
  if (valuationQuery.isPending && !valuationQuery.data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在加载持仓">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (valuationQuery.isError && !valuationQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>持仓读取失败</AlertTitle>
        <AlertDescription>当前余额观察未更新，请重试。</AlertDescription>
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
    <section className="flex flex-col gap-4" aria-labelledby="account-data-positions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="account-data-positions-title" className="m-0 text-xl font-semibold">
            持仓余额观察
          </h2>
          <p className="m-0 mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            “校准持仓余额”创建观察检查点，不代表真实成交；单标的录入属于 PARTIAL 观察。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onOpenImport}
            disabled={account.type === 'cash'}
          >
            导入持仓快照
          </Button>
          <Button type="button" variant="outline" onClick={onOpenReconciliation}>
            查看对账候选
          </Button>
        </div>
      </div>
      <Card className="shadow-none">
        <CardContent className="p-4 text-sm text-muted-foreground">
          当前结果来自账本投影；每条记录会显示来源和观察检查点状态。需要录入 BUY/SELL
          时，请回到“成交记录”。
        </CardContent>
      </Card>
      <PortfolioManagement
        key={account.id}
        accounts={accounts}
        positions={positions}
        cashValue={cashValue}
        step="position"
        defaultAccountId={account.id}
        entryAccountLocked
        showCash={false}
        calibrationMode
        onDirtyChange={onDirtyChange}
        onSaved={onSaved}
      />
    </section>
  );
}

type ValuationLike = ReturnType<typeof useAccountValuationQuery>;

type PendingCash = {
  id: string;
  currency: Currency;
  amount: number;
  direction: '应收' | '应付';
  label: string;
  settledAt: string;
};

const chargeTotal = (event: ExecutionEvent, currency: Currency) =>
  sumBy(event.payload.charges, (charge) => {
    if (charge.currency !== currency) return 0;
    return Number(charge.amount);
  });

const pendingCash = (events: LedgerEventV2[]): PendingCash[] => {
  const now = Date.now();
  const rows: PendingCash[] = [];
  for (const event of events) {
    if (isExecutionEvent(event) && event.payload.settledAt) {
      const settled = new Date(event.payload.settledAt);
      const amount = Number(event.payload.quantity) * Number(event.payload.price);
      if (Number.isNaN(settled.getTime()) || settled.getTime() <= now || !Number.isFinite(amount))
        continue;
      const currency = supportedCurrency(event.payload.currency);
      const total = amount + chargeTotal(event, currency);
      rows.push({
        id: event.eventId,
        currency,
        amount: total,
        direction: event.type === 'BUY_EXECUTION' ? '应付' : '应收',
        label:
          event.type === 'BUY_EXECUTION'
            ? `买入 ${event.payload.symbol}`
            : `卖出 ${event.payload.symbol}`,
        settledAt: event.payload.settledAt,
      });
      continue;
    }
    if (event.revisionAction !== 'VOID' && event.type === 'CASH_FLOW' && event.payload.settledAt) {
      const settled = new Date(event.payload.settledAt);
      const amount = Number(event.payload.amount);
      if (Number.isNaN(settled.getTime()) || settled.getTime() <= now || !Number.isFinite(amount))
        continue;
      rows.push({
        id: event.eventId,
        currency: supportedCurrency(event.payload.currency),
        amount,
        direction: event.payload.direction === 'INFLOW' ? '应收' : '应付',
        label: event.payload.category,
        settledAt: event.payload.settledAt,
      });
      continue;
    }
    if (event.revisionAction !== 'VOID' && event.type === 'DIVIDEND' && event.payload.settledAt) {
      const settled = new Date(event.payload.settledAt);
      const amount = Number(event.payload.amount);
      if (Number.isNaN(settled.getTime()) || settled.getTime() <= now || !Number.isFinite(amount))
        continue;
      rows.push({
        id: event.eventId,
        currency: supportedCurrency(event.payload.currency),
        amount,
        direction: '应收',
        label: `分红 ${event.payload.symbol}`,
        settledAt: event.payload.settledAt,
      });
    }
  }
  return rows;
};

export function CashSection({
  account,
  valuation,
  valuationQuery,
  events,
  eventsQuery,
  onCalibrate,
}: {
  account: Account;
  valuation: NonNullable<ValuationLike['data']> | undefined;
  valuationQuery: ValuationLike;
  events: LedgerEventV2[];
  eventsQuery: QueryLike;
  onCalibrate: () => void;
}) {
  const settledRows = useMemo(() => {
    const rows = valuation?.cashByCurrency ?? [];
    const seen = new Set(rows.map((row) => row.currency));
    if (!seen.has(account.currency)) {
      return [{ currency: account.currency, amount: 0, convertedAmount: null }, ...rows];
    }
    return rows;
  }, [account.currency, valuation?.cashByCurrency]);
  const pendingRows = useMemo(() => pendingCash(events), [events]);
  const evidencePartial = Boolean(valuation?.dataQuality?.partial) || eventsQuery.isError;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="account-data-cash-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="account-data-cash-title" className="m-0 text-xl font-semibold">
            现金
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            已结算余额按币种分桶；有明确 settledAt 的未来现金影响单独列为待结算。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCalibrate}>
          校准现金余额
        </Button>
      </div>
      <CashResults
        account={account}
        valuation={valuation}
        valuationQuery={valuationQuery}
        settledRows={settledRows}
        pendingRows={pendingRows}
        evidencePartial={evidencePartial}
      />
      {eventsQuery.isError && eventsQuery.data && (
        <Alert>
          <AlertTitle>待结算列表可能陈旧</AlertTitle>
          <AlertDescription>现金余额仍保留上次成功结果；请刷新账本后再做校准。</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function CashResults({
  account,
  valuation,
  valuationQuery,
  settledRows,
  pendingRows,
  evidencePartial,
}: {
  account: Account;
  valuation: NonNullable<ValuationLike['data']> | undefined;
  valuationQuery: ValuationLike;
  settledRows: Array<{ currency: Currency; amount: number; convertedAmount: number | null }>;
  pendingRows: PendingCash[];
  evidencePartial: boolean;
}) {
  if (valuationQuery.isPending && !valuation) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在加载现金">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
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
    <>
      <Card className="shadow-none">
        <CardHeader className="gap-2 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>已结算余额</CardTitle>
            <Badge variant={evidencePartial ? 'secondary' : 'outline'}>
              证据完整度：{evidencePartial ? '部分' : '完整'}
            </Badge>
          </div>
          <CardDescription>不会把不同币种直接相加；折算值只有在汇率可用时显示。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {settledRows.map((row) => (
            <div key={row.currency} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{row.currency}</span>
                <Badge variant="outline">已结算</Badge>
              </div>
              <strong className="mt-3 block font-mono text-lg font-medium">
                {formatCurrencyAmount(row.amount, row.currency)}
              </strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                本位币折算：
                {row.convertedAmount === null
                  ? '不可用'
                  : formatCurrencyAmount(row.convertedAmount, account.currency)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="gap-2 border-b">
          <CardTitle>待结算应收 / 应付</CardTitle>
          <CardDescription>
            只根据账本中明确的未来 settledAt 展示，不推测缺失的结算时间。
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingRows.length === 0 ? (
            <Empty className="min-h-32 rounded-none border-0 p-6">
              <EmptyDescription>暂无明确的待结算现金影响。</EmptyDescription>
            </Empty>
          ) : (
            <div className="divide-y">
              {pendingRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <strong className="block text-sm font-medium">{row.label}</strong>
                    <span className="text-xs text-muted-foreground">
                      {row.currency} · 结算于 {formatDate(row.settledAt)}
                    </span>
                  </div>
                  <Badge variant={row.direction === '应收' ? 'default' : 'secondary'}>
                    {row.direction} {formatCurrencyAmount(row.amount, row.currency)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
