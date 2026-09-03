import type { LedgerEventV2 } from '@thesis-ledger/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MoreHorizontalIcon } from 'lucide-react';

import type { Account, Position } from '../portfolio/portfolio.types.js';
import type { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import {
  eventTypeLabel,
  eventSubjectDetail,
  eventSymbol,
  executionSideLabel,
  formatDate,
  formatDecimal,
  isExecutionEvent,
  revisionBadgeVariant,
  revisionLabel,
  sourceChannelLabel,
  transactionAmount,
  transactionFilters,
} from './account-data.helpers.js';
import {
  isCashTransferEvent,
  type CashTransferEvent,
  type ExecutionEvent,
} from './account-data.types.js';
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
  onCorrectTransfer,
  onVoidTransfer,
  onAudit,
  onOpenImport,
  onOpenReconciliation,
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
}: {
  account: Account;
  events: LedgerEventV2[];
  query: QueryLike;
  filter: AccountDataEventFilter;
  onFilterChange: (filter: AccountDataEventFilter) => void;
  onCreate: () => void;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
  onAudit: (event: LedgerEventV2) => void;
  onOpenImport: () => void;
  onOpenReconciliation: () => void;
  findSnapshotPosition: (event: LedgerEventV2) => Position | undefined;
  onEditSnapshot: (event: LedgerEventV2) => void;
  onRemoveSnapshot: (event: LedgerEventV2) => void;
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
            这里显示当前有效版本；修正链保留在审计面板中，不会重复计数。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCreate} disabled={account.type === 'cash'}>
            录入成交
          </Button>
          <Button type="button" variant="outline" onClick={onOpenImport} disabled>
            导入草稿（暂未开放）
          </Button>
          <Button type="button" variant="outline" onClick={onOpenReconciliation} disabled>
            打开对账（暂未开放）
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
        findSnapshotPosition={findSnapshotPosition}
        onEditSnapshot={onEditSnapshot}
        onRemoveSnapshot={onRemoveSnapshot}
        onCorrect={onCorrect}
        onVoid={onVoid}
        onCorrectTransfer={onCorrectTransfer}
        onVoidTransfer={onVoidTransfer}
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
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
  onCorrect,
  onVoid,
  onCorrectTransfer,
  onVoidTransfer,
  onAudit,
}: {
  query: QueryLike;
  filter: AccountDataEventFilter;
  emptyTitle: string;
  filteredEvents: LedgerEventV2[];
  findSnapshotPosition: (event: LedgerEventV2) => Position | undefined;
  onEditSnapshot: (event: LedgerEventV2) => void;
  onRemoveSnapshot: (event: LedgerEventV2) => void;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
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
        : '持仓快照、余额快照、公司行动、分红和现金流会在产生后显示。';
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
            <th className="px-4 py-3 font-medium">发生时间</th>
            <th className="px-4 py-3 font-medium">金额/数量</th>
            <th className="px-4 py-3 font-medium">来源</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filteredEvents.map((event) => (
            <TransactionRow
              key={event.eventId}
              event={event}
              findSnapshotPosition={findSnapshotPosition}
              onEditSnapshot={onEditSnapshot}
              onRemoveSnapshot={onRemoveSnapshot}
              onCorrect={onCorrect}
              onVoid={onVoid}
              onCorrectTransfer={onCorrectTransfer}
              onVoidTransfer={onVoidTransfer}
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
  onCorrectTransfer,
  onVoidTransfer,
  onAudit,
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
}: {
  event: LedgerEventV2;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
  onAudit: (event: LedgerEventV2) => void;
  findSnapshotPosition: (event: LedgerEventV2) => Position | undefined;
  onEditSnapshot: (event: LedgerEventV2) => void;
  onRemoveSnapshot: (event: LedgerEventV2) => void;
}) {
  const execution = isExecutionEvent(event);
  const cashTransfer = isCashTransferEvent(event);
  const snapshotPosition = findSnapshotPosition(event);
  const title = eventSymbol(event) ?? eventTypeLabel(event);
  const detail = execution
    ? `${executionSideLabel(event)} · ${formatDecimal(event.payload.quantity)} · ${formatDecimal(event.payload.price)} ${event.payload.currency}`
    : (eventSubjectDetail(event) ?? sourceChannelLabel(event.source.channel));
  const amount = transactionAmount(event, execution ? event : null);
  return (
    <tr data-ledger-event-id={event.eventId}>
      <td className="max-w-[240px] px-4 py-3 align-top">
        <strong className="block truncate font-medium">{title}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
        {formatDate(event.occurredAt)}
        <span className="mt-1 block text-xs">记录于 {formatDate(event.recordedAt)}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-muted-foreground">
        {amount}
      </td>
      <td className="px-4 py-3 align-top">
        <span className="block text-xs text-muted-foreground">
          {sourceChannelLabel(event.source.channel)}
        </span>
        {event.source.sourceRowId && (
          <span className="mt-1 block text-xs text-muted-foreground">
            来源行 {event.source.sourceRowId}
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <Badge variant={revisionBadgeVariant(event)}>{revisionLabel(event)}</Badge>
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
          {snapshotPosition && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onEditSnapshot(event)}
              >
                修改
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => onRemoveSnapshot(event)}
              >
                移除
              </Button>
            </>
          )}
          {cashTransfer && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="管理现金划转">
                    <MoreHorizontalIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onCorrectTransfer(event)}>
                    更正划转
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onVoidTransfer(event)}>
                    作废划转
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
  entrySheetOpen,
  onEntrySheetOpenChange,
  editingPosition,
  onEditingPositionChange,
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
  entrySheetOpen: boolean;
  onEntrySheetOpenChange: (open: boolean) => void;
  editingPosition: Position | null;
  onEditingPositionChange: (editing: Position | null) => void;
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
        <AlertDescription>当前余额快照未更新，请重试。</AlertDescription>
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
      embedded
      entrySheetOpen={entrySheetOpen}
      onEntrySheetOpenChange={onEntrySheetOpenChange}
      editingPosition={editingPosition}
      onEditingPositionChange={onEditingPositionChange}
      onOpenImport={onOpenImport}
      onOpenReconciliation={onOpenReconciliation}
      onDirtyChange={onDirtyChange}
      onSaved={onSaved}
    />
  );
}
