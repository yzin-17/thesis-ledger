import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { TableContainer } from '@/components/ui/table';
import type { LedgerEvent } from '@thesis-ledger/api-client';
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
import { LoadingState } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MoreHorizontalIcon } from 'lucide-react';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';

import type { Account, Position } from '../portfolio/portfolio.types.js';
import type { useAccountValuationQuery } from '../portfolio/portfolio.queries.js';
import { PortfolioManagement } from '../portfolio/PortfolioManagement.js';
import {
  eventTypeLabel,
  eventSubjectDetail,
  eventSymbol,
  executionDetailLabel,
  formatDate,
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
import { AccountDataEventActions } from './AccountDataEventActions.js';
import { fundInvestmentOccurrenceId } from './account-data.fund-investment.display.js';
import { LedgerContractFailure, ledgerContractRejected } from './account-data.ledger-contract.js';

type QueryLike = {
  error?: unknown;
  data: { events: LedgerEvent[]; ledgerRevision: string } | undefined;
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
  onOpenFundInvestment,
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
  resolveInstrumentName,
}: {
  account: Account;
  events: LedgerEvent[];
  query: QueryLike;
  filter: AccountDataEventFilter;
  onFilterChange: (filter: AccountDataEventFilter) => void;
  onCreate: () => void;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
  onAudit: (event: LedgerEvent) => void;
  onOpenFundInvestment?: ((occurrenceId: string | null) => void) | undefined;
  onOpenImport: () => void;
  onOpenReconciliation: () => void;
  findSnapshotPosition: (event: LedgerEvent) => Position | undefined;
  onEditSnapshot: (event: LedgerEvent) => void;
  onRemoveSnapshot: (event: LedgerEvent) => void;
  resolveInstrumentName: (symbol: string) => string | undefined;
}) {
  if (query.isError && ledgerContractRejected(query.error))
    return <LedgerContractFailure onRetry={query.refetch} />;
  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    const execution = isExecutionEvent(event);
    return filter === 'executions' ? execution : !execution;
  });
  const emptyTitle = filter === 'executions' ? '暂无成交记录' : '暂无其他账本事件';
  return (
    <section className="flex flex-col gap-4" aria-label="成交记录">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" onClick={onCreate} disabled={account.type === 'cash'}>
            录入成交
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="icon-sm" variant="ghost" aria-label="更多成交操作">
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={account.type === 'cash'} onClick={onOpenImport}>
                  导入草稿
                </DropdownMenuItem>
                <DropdownMenuItem disabled={account.type === 'cash'} onClick={onOpenReconciliation}>
                  打开对账
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ListRefreshRegion refreshing={query.isFetching && !!query.data} label="正在刷新成交记录">
        <TransactionResults
          query={query}
          onOpenFundInvestment={onOpenFundInvestment}
          filter={filter}
          emptyTitle={emptyTitle}
          filteredEvents={filteredEvents}
          findSnapshotPosition={findSnapshotPosition}
          onEditSnapshot={onEditSnapshot}
          onRemoveSnapshot={onRemoveSnapshot}
          resolveInstrumentName={resolveInstrumentName}
          onCorrect={onCorrect}
          onVoid={onVoid}
          onCorrectTransfer={onCorrectTransfer}
          onVoidTransfer={onVoidTransfer}
          onAudit={onAudit}
        />
      </ListRefreshRegion>
      {query.isError && query.data && !ledgerContractRejected(query.error) && (
        <Alert>
          <AlertTitle>显示的是上次成功读取的结果</AlertTitle>
          <AlertDescription>
            本次刷新失败。已成功提交的操作无需再次提交；提交修正前请重新读取最新账本版本。
          </AlertDescription>
          <Button
            aria-busy={query.isFetching}
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            重新读取账本
          </Button>
        </Alert>
      )}
    </section>
  );
}

function TransactionResults({
  onOpenFundInvestment,
  query,
  filter,
  emptyTitle,
  filteredEvents,
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
  resolveInstrumentName,
  onCorrect,
  onVoid,
  onCorrectTransfer,
  onVoidTransfer,
  onAudit,
}: {
  query: QueryLike;
  filter: AccountDataEventFilter;
  emptyTitle: string;
  filteredEvents: LedgerEvent[];
  findSnapshotPosition: (event: LedgerEvent) => Position | undefined;
  onEditSnapshot: (event: LedgerEvent) => void;
  onRemoveSnapshot: (event: LedgerEvent) => void;
  resolveInstrumentName: (symbol: string) => string | undefined;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
  onAudit: (event: LedgerEvent) => void;
  onOpenFundInvestment?: ((occurrenceId: string | null) => void) | undefined;
}) {
  if (query.isError && ledgerContractRejected(query.error))
    return <LedgerContractFailure onRetry={query.refetch} />;
  if (query.isPending && !query.data) {
    return <LoadingState label="正在加载成交记录" />;
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
        ? '录入或确认第一笔成交后，会在这里显示。'
        : '持仓快照、余额快照、公司行动、分红和现金流会在产生后显示。';
    return (
      <Empty className="min-h-56 rounded-md border border-border bg-card p-8">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <TableContainer className="bg-card">
      <table className="w-full min-w-[900px] table-fixed text-left text-sm">
        <caption className="sr-only">账本事件</caption>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[20%]" />
          <col className="w-[12%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-medium">标的 / 成交内容</th>
            <th className="px-3 py-3 font-medium">发生时间</th>
            <th className="px-3 py-3 font-medium text-right">
              {filter === 'executions' ? '成交金额' : '金额 / 数量'}
            </th>
            <th className="px-3 py-3 font-medium">来源</th>
            <th className="px-3 py-3 font-medium">状态</th>
            <StickyTableActionHeader className="w-auto min-w-0 px-3 py-3 font-medium">
              操作
            </StickyTableActionHeader>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filteredEvents.map((event) => (
            <TransactionRow
              key={event.eventId}
              event={event}
              onOpenFundInvestment={onOpenFundInvestment}
              findSnapshotPosition={findSnapshotPosition}
              onEditSnapshot={onEditSnapshot}
              onRemoveSnapshot={onRemoveSnapshot}
              resolveInstrumentName={resolveInstrumentName}
              onCorrect={onCorrect}
              onVoid={onVoid}
              onCorrectTransfer={onCorrectTransfer}
              onVoidTransfer={onVoidTransfer}
              onAudit={onAudit}
            />
          ))}
        </tbody>
      </table>
    </TableContainer>
  );
}

function TransactionRow({
  onOpenFundInvestment,
  event,
  onCorrect,
  onVoid,
  onCorrectTransfer,
  onVoidTransfer,
  onAudit,
  findSnapshotPosition,
  onEditSnapshot,
  onRemoveSnapshot,
  resolveInstrumentName,
}: {
  event: LedgerEvent;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onCorrectTransfer: (event: CashTransferEvent) => void;
  onVoidTransfer: (event: CashTransferEvent) => void;
  onAudit: (event: LedgerEvent) => void;
  onOpenFundInvestment?: ((occurrenceId: string | null) => void) | undefined;
  findSnapshotPosition: (event: LedgerEvent) => Position | undefined;
  onEditSnapshot: (event: LedgerEvent) => void;
  onRemoveSnapshot: (event: LedgerEvent) => void;
  resolveInstrumentName: (symbol: string) => string | undefined;
}) {
  const execution = isExecutionEvent(event);
  const cashTransfer = isCashTransferEvent(event);
  const snapshotPosition = findSnapshotPosition(event);
  const symbol = eventSymbol(event);
  const instrumentName = symbol ? resolveInstrumentName(symbol) : undefined;
  const title = instrumentName ?? symbol ?? eventTypeLabel(event);
  const baseDetail = execution
    ? executionDetailLabel(event)
    : (eventSubjectDetail(event) ?? sourceChannelLabel(event.source.channel));
  const detail = instrumentName && symbol ? `${symbol} · ${baseDetail}` : baseDetail;
  const amount = transactionAmount(event, execution ? event : null);
  let primary: { label: string; run: () => void } | undefined;
  let destructive: { label: string; run: () => void } | undefined;
  if (execution) {
    primary = { label: '更正', run: () => onCorrect(event) };
    destructive = { label: '作废', run: () => onVoid(event) };
  } else if (snapshotPosition) {
    primary = { label: '修改', run: () => onEditSnapshot(event) };
    destructive = { label: '移除快照', run: () => onRemoveSnapshot(event) };
  } else if (cashTransfer) {
    primary = { label: '更正划转', run: () => onCorrectTransfer(event) };
    destructive = { label: '作废划转', run: () => onVoidTransfer(event) };
  }

  return (
    <tr data-ledger-event-id={event.eventId}>
      <td className="min-w-0 max-w-0 whitespace-normal px-3 py-3 align-top">
        <strong className="block truncate font-medium">{title}</strong>
        <span className="mt-1 block break-words text-xs text-muted-foreground">{detail}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
        {formatDate(event.occurredAt)}
        <span className="mt-1 block text-xs">记录于 {formatDate(event.recordedAt)}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right align-top font-mono text-xs text-muted-foreground">
        {amount}
      </td>
      <td className="truncate px-3 py-3 align-top">
        <span className="block text-xs text-muted-foreground">
          {sourceChannelLabel(event.source.channel)}
        </span>
        {event.source.channel === 'recurring-fund-investment' && onOpenFundInvestment && (
          <Button
            type="button"
            size="xs"
            variant="link"
            className="h-auto p-0"
            onClick={() => onOpenFundInvestment(fundInvestmentOccurrenceId(event.source))}
          >
            查看定投计划
          </Button>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top">
        <Badge variant={revisionBadgeVariant(event)}>{revisionLabel(event)}</Badge>
      </td>
      <StickyTableActionCell className="w-auto min-w-0 px-3 py-3 align-top">
        <AccountDataEventActions
          subject={title}
          primary={primary}
          destructive={destructive}
          onHistory={() => onAudit(event)}
        />
      </StickyTableActionCell>
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
  onBusyChange,
  onSaved,
  onOpenImport,
  onOpenReconciliation,
  resolveInstrumentName,
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
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<unknown>;
  onOpenImport: () => void;
  onOpenReconciliation: () => void;
  resolveInstrumentName: (symbol: string) => string | undefined;
  entrySheetOpen: boolean;
  onEntrySheetOpenChange: (open: boolean) => void;
  editingPosition: Position | null;
  onEditingPositionChange: (editing: Position | null) => void;
}) {
  if (valuationQuery.isPending && !valuationQuery.data) {
    return <LoadingState label="正在加载持仓" />;
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
    <div className="flex flex-col gap-group">
      {valuationQuery.isError && valuationQuery.data && (
        <Alert>
          <AlertTitle>持仓快照暂未更新</AlertTitle>
          <AlertDescription>
            显示的是上次成功读取的结果；已成功保存的快照无需再次提交。
          </AlertDescription>
          <Button
            aria-busy={valuationQuery.isFetching}
            type="button"
            variant="outline"
            size="sm"
            disabled={valuationQuery.isFetching}
            onClick={() => void valuationQuery.refetch()}
          >
            重新读取持仓快照
          </Button>
        </Alert>
      )}
      <PortfolioManagement
        key={account.id}
        accounts={accounts}
        positions={positions}
        positionsRefreshing={valuationQuery.isFetching && !!valuationQuery.data}
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
        resolveInstrumentName={resolveInstrumentName}
        onOpenImport={onOpenImport}
        onOpenReconciliation={onOpenReconciliation}
        onDirtyChange={onDirtyChange}
        onBusyChange={onBusyChange}
        onSaved={onSaved}
      />
    </div>
  );
}
