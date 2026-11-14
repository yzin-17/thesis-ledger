import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { useToastManager } from '@/components/ui/toast';
import type {
  RecurringCashDepositOccurrence,
  RecurringCashDepositPlan,
} from '@thesis-ledger/api-client';
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import {
  type OccurrenceAction,
  OccurrenceActionSheet,
  type PlanEditor,
  PlanEditorSheet,
} from './AccountDataCashDepositEditors.js';

import type { Account } from '../portfolio/portfolio.types.js';
import { useCashDepositQueries, useCashOperationsMutations } from './account-data.cash.queries.js';
import {
  errorMessage,
  formatCurrencyAmount,
  formatDate,
  supportedCurrency,
} from './account-data.helpers.js';

type PlanStateAction = 'pause' | 'resume' | 'end';

const planStateDescription: Record<PlanStateAction, string> = {
  pause: '已暂停',
  resume: '已恢复',
  end: '已结束',
};

const planStatus = (status: RecurringCashDepositPlan['status']) => {
  if (status === 'ACTIVE') return '启用';
  if (status === 'PAUSED') return '已暂停';
  return '已结束';
};

const isOccurrenceOverdue = (occurrence: RecurringCashDepositOccurrence, now = new Date()) => {
  if (occurrence.status !== 'PENDING') return false;
  const scheduledAt = new Date(occurrence.scheduledFor).getTime();
  return !Number.isNaN(scheduledAt) && scheduledAt <= now.getTime();
};

export function RecurringCashDeposits(props: { account: Account }) {
  const control = useRecurringCashDeposits(props);
  const {
    pending,
    queries,
    setEditor,
    overdue,
    setOccurrenceAction,
    editor,
    account,
    occurrenceAction,
    enabled,
  } = control;
  if (!enabled) return null;
  return (
    <section
      className="@container flex min-w-0 flex-col gap-4"
      aria-labelledby="recurring-cash-deposit-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id="recurring-cash-deposit-title" className="m-0 text-base font-semibold">
              定期入账
            </h3>
            {pending.length === 0 && queries.occurrences.data !== undefined && (
              <span className="text-xs text-muted-foreground">暂无待确认入账</span>
            )}
          </div>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            到期后核对金额和到账时间，确认后计入现金余额。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditor({ mode: 'create', plan: null })}
        >
          <PlusIcon data-icon="inline-start" />
          新建计划
        </Button>
      </header>
      {(queries.plans.isError || queries.occurrences.isError) && (
        <Alert variant="destructive">
          <AlertTitle>定期入账读取失败</AlertTitle>
          <AlertDescription>
            计划或待确认记录未更新。已成功保存或确认的操作无需再次提交，请重新读取。
          </AlertDescription>
          <Button
            aria-busy={queries.plans.isFetching || queries.occurrences.isFetching}
            type="button"
            variant="outline"
            size="sm"
            disabled={queries.plans.isFetching || queries.occurrences.isFetching}
            onClick={() =>
              void Promise.all([queries.plans.refetch(), queries.occurrences.refetch()])
            }
          >
            重新读取定期入账
          </Button>
        </Alert>
      )}
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>有 {overdue.length} 条入账已逾期</AlertTitle>
          <AlertDescription>
            这些待确认实例已超过计划时间，确认前仍不会改变现金余额。
          </AlertDescription>
        </Alert>
      )}
      {pending.length > 0 && <PendingCashDeposits control={control} />}
      <div className="grid min-w-0 items-start gap-4 @3xl:grid-cols-2">
        <CashDepositPlans control={control} />
        <CashDepositHistory control={control} />
      </div>
      {editor && (
        <PlanEditorSheet
          key={`${editor.mode}:${editor.plan?.id ?? 'new'}`}
          account={account}
          editor={editor}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
      {occurrenceAction && (
        <OccurrenceActionSheet
          key={`${occurrenceAction.type}:${occurrenceAction.occurrence.id}`}
          action={occurrenceAction}
          open
          onOpenChange={(open) => !open && setOccurrenceAction(null)}
          onSaved={() => setOccurrenceAction(null)}
        />
      )}
    </section>
  );
}

function PendingCashDeposits({
  control,
}: {
  control: ReturnType<typeof useRecurringCashDeposits>;
}) {
  return (
    <>
      <Card size="sm" role="region" aria-labelledby="recurring-cash-pending-title">
        <CardHeader>
          <CardTitle id="recurring-cash-pending-title" className="flex items-baseline gap-2">
            待确认入账{' '}
            <span className="text-xs text-muted-foreground">{control.pending.length} 条</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <ListRefreshRegion
            refreshing={control.queries.occurrences.isRefetching}
            label="正在刷新待确认入账"
            className="flex flex-col gap-3"
          >
            {control.pending.map((occurrence) => (
              <div
                key={occurrence.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-medium">
                      {occurrence.planName} · {occurrence.periodKey}
                    </strong>
                    {isOccurrenceOverdue(occurrence) && <Badge variant="destructive">已逾期</Badge>}
                  </div>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {isOccurrenceOverdue(occurrence) ? '原定' : '计划'}{' '}
                    {formatDate(occurrence.scheduledFor)} ·{' '}
                    {formatCurrencyAmount(
                      Number(occurrence.expectedAmount),
                      supportedCurrency(occurrence.currency),
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => control.setOccurrenceAction({ type: 'confirm', occurrence })}
                  >
                    确认入账
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => control.setOccurrenceAction({ type: 'skip', occurrence })}
                  >
                    跳过
                  </Button>
                </div>
              </div>
            ))}
          </ListRefreshRegion>
        </CardContent>
      </Card>
    </>
  );
}
function CashDepositPlans({ control }: { control: ReturnType<typeof useRecurringCashDeposits> }) {
  return (
    <>
      <Card size="sm" role="region" aria-labelledby="recurring-cash-plans-title">
        <CardHeader>
          <CardTitle id="recurring-cash-plans-title" className="flex items-baseline gap-2">
            入账计划
            <span className="text-xs text-muted-foreground">
              {control.queries.plans.data === undefined ? '—' : control.plans.length} 个
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {control.queries.plans.isLoading && <LoadingState label="正在读取定期入账计划" />}
          <ListRefreshRegion
            refreshing={
              control.queries.plans.isRefetching && control.queries.plans.data !== undefined
            }
            label="正在刷新入账计划"
          >
            {control.plans.length === 0 && !control.queries.plans.isLoading && (
              <Empty className="items-start p-0">
                <EmptyDescription>
                  {control.queries.plans.data === undefined ? '计划尚未加载' : '暂无定期入账计划'}
                </EmptyDescription>
              </Empty>
            )}
            {control.plans.length > 0 && (
              <div className="divide-y divide-border">
                {control.plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm font-medium" title={plan.name}>
                          {plan.name}
                        </strong>
                        <Badge variant={plan.status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {planStatus(plan.status)}
                        </Badge>
                      </div>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        每月 {plan.dayOfMonth} 日
                        {plan.nextDueAt ? ` · 下次 ${formatDate(plan.nextDueAt)}` : ''}
                      </span>
                    </div>
                    <div className="flex min-w-0 shrink-0 items-center gap-2">
                      <strong className="text-sm font-medium tabular-nums">
                        {formatCurrencyAmount(
                          Number(plan.expectedAmount),
                          supportedCurrency(plan.currency),
                        )}
                      </strong>
                      {plan.status !== 'ENDED' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`管理计划：${plan.name}`}
                              >
                                <MoreHorizontalIcon />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => control.setEditor({ mode: 'edit', plan })}
                              >
                                修改计划
                              </DropdownMenuItem>
                              {plan.status === 'ACTIVE' && (
                                <DropdownMenuItem
                                  onClick={() => void control.changePlanState(plan, 'pause')}
                                >
                                  暂停计划
                                </DropdownMenuItem>
                              )}
                              {plan.status === 'PAUSED' && (
                                <DropdownMenuItem
                                  onClick={() => void control.changePlanState(plan, 'resume')}
                                >
                                  恢复计划
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => void control.changePlanState(plan, 'end')}
                              >
                                结束计划
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ListRefreshRegion>
        </CardContent>
      </Card>
    </>
  );
}
function CashDepositHistory({ control }: { control: ReturnType<typeof useRecurringCashDeposits> }) {
  return (
    <>
      <Card size="sm" role="region" aria-labelledby="recurring-cash-history-title">
        <CardHeader>
          <CardTitle id="recurring-cash-history-title" className="flex items-baseline gap-2">
            入账历史
            <span className="text-xs text-muted-foreground">
              {control.queries.occurrences.data === undefined
                ? '—'
                : control.confirmed.length + control.skipped.length}{' '}
              条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {control.queries.occurrences.isLoading && <LoadingState label="正在读取入账记录" />}
          <ListRefreshRegion
            refreshing={
              control.queries.occurrences.isRefetching &&
              control.queries.occurrences.data !== undefined
            }
            label="正在刷新入账记录"
            className="flex flex-col gap-4"
          >
            {control.confirmed.length + control.skipped.length === 0 &&
              !control.queries.occurrences.isLoading && (
                <Empty className="items-start p-0">
                  <EmptyDescription>
                    {control.queries.occurrences.data === undefined
                      ? '入账记录尚未加载'
                      : '暂无入账记录'}
                  </EmptyDescription>
                </Empty>
              )}
            {control.confirmed.length > 0 && (
              <div role="group" aria-label="已确认历史" className="divide-y divide-border">
                {control.confirmed.map((occurrence) => (
                  <div
                    key={occurrence.id}
                    className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong
                          className="min-w-0 truncate text-sm font-medium"
                          title={occurrence.planName}
                        >
                          {occurrence.planName}
                        </strong>
                        <Badge variant="secondary">已确认</Badge>
                      </div>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {occurrence.periodKey} · 入账 {formatDate(occurrence.occurredAt)}
                      </span>
                    </div>
                    <div className="min-w-0 text-right">
                      <strong className="block text-sm font-medium tabular-nums">
                        {formatCurrencyAmount(
                          Number(occurrence.actualAmount ?? occurrence.expectedAmount),
                          supportedCurrency(occurrence.currency),
                        )}
                      </strong>
                      <span className="text-xs text-muted-foreground">实际入账</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {control.skipped.length > 0 && (
              <div role="group" aria-label="已跳过记录" className="divide-y divide-border">
                {control.skipped.map((occurrence) => (
                  <div
                    key={occurrence.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong
                          className="min-w-0 truncate text-sm font-medium"
                          title={occurrence.planName}
                        >
                          {occurrence.planName}
                        </strong>
                        <Badge variant="secondary">已跳过</Badge>
                      </div>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {occurrence.periodKey}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void control.reopen(occurrence)}
                    >
                      恢复待确认
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ListRefreshRegion>
        </CardContent>
      </Card>
    </>
  );
}

function useRecurringCashDeposits({ account }: { account: Account }) {
  const toastManager = useToastManager();
  const enabled = account.type === 'cash' && account.mode === 'actual' && account.active !== false;
  const queries = useCashDepositQueries(account.id, enabled);
  const mutations = useCashOperationsMutations(account.id, account.mode);
  const [editor, setEditor] = useState<PlanEditor | null>(null);
  const [occurrenceAction, setOccurrenceAction] = useState<OccurrenceAction | null>(null);
  const plans = queries.plans.data ?? [];
  const occurrences = queries.occurrences.data ?? [];
  const pending = occurrences.filter((occurrence) => occurrence.status === 'PENDING');
  const overdue = pending.filter((occurrence) => isOccurrenceOverdue(occurrence));
  const confirmed = occurrences.filter((occurrence) => occurrence.status === 'CONFIRMED');
  const skipped = occurrences.filter((occurrence) => occurrence.status === 'SKIPPED');

  const changePlanState = async (plan: RecurringCashDepositPlan, action: PlanStateAction) => {
    try {
      await mutations.changePlanState.mutateAsync({
        id: plan.id,
        action,
        expectedVersion: plan.version,
      });
      toastManager.add({
        title: '计划状态已更新',
        description: `${plan.name}：${planStateDescription[action]}`,
        type: 'success',
      });
    } catch (error) {
      toastManager.add({
        title: '计划操作失败',
        description: errorMessage(error, '请刷新后重试。'),
        type: 'error',
      });
    }
  };

  const reopen = async (occurrence: RecurringCashDepositOccurrence) => {
    try {
      await mutations.reopenOccurrence.mutateAsync({
        id: occurrence.id,
        expectedVersion: occurrence.version,
      });
      toastManager.add({
        title: '已恢复为待确认',
        description: `${occurrence.periodKey} 可重新确认入账。`,
        type: 'success',
      });
    } catch (error) {
      toastManager.add({
        title: '恢复失败',
        description: errorMessage(error, '请刷新后重试。'),
        type: 'error',
      });
    }
  };

  return {
    pending,
    queries,
    setEditor,
    overdue,
    setOccurrenceAction,
    plans,
    changePlanState,
    confirmed,
    skipped,
    reopen,
    editor,
    account,
    occurrenceAction,
    enabled,
  };
}
