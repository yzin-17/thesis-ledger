import { useState } from 'react';
import type {
  RecurringCashDepositOccurrence,
  RecurringCashDepositPlan,
} from '@thesis-ledger/api-client';
import { Loader2Icon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';

import type { Account } from '../portfolio/portfolio.types.js';
import {
  currentLocalDateTime,
  formatCurrencyAmount,
  formatDate,
  supportedCurrency,
} from './account-data.helpers.js';
import { useCashDepositQueries, useCashOperationsMutations } from './account-data.cash.queries.js';

type PlanEditor = { mode: 'create'; plan: null } | { mode: 'edit'; plan: RecurringCashDepositPlan };
type OccurrenceAction = { type: 'confirm' | 'skip'; occurrence: RecurringCashDepositOccurrence };
type PlanStateAction = 'pause' | 'resume' | 'end';

const planStateDescription: Record<PlanStateAction, string> = {
  pause: '已暂停',
  resume: '已恢复',
  end: '已结束',
};

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const planStatus = (status: RecurringCashDepositPlan['status']) => {
  if (status === 'ACTIVE') return '启用';
  if (status === 'PAUSED') return '已暂停';
  return '已结束';
};

const isOccurrenceOverdue = (
  occurrence: RecurringCashDepositOccurrence,
  now = new Date(),
) => {
  if (occurrence.status !== 'PENDING') return false;
  const scheduledAt = new Date(occurrence.scheduledFor).getTime();
  return !Number.isNaN(scheduledAt) && scheduledAt <= now.getTime();
};

export function RecurringCashDeposits({ account }: { account: Account }) {
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

  if (!enabled) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>定期入账</CardTitle>
          <CardDescription>仅真实且启用的现金账户支持月度计划。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const changePlanState = async (
    plan: RecurringCashDepositPlan,
    action: PlanStateAction,
  ) => {
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
        description: error instanceof Error ? error.message : '请刷新后重试。',
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
        description: error instanceof Error ? error.message : '请刷新后重试。',
        type: 'error',
      });
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="recurring-cash-deposit-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="recurring-cash-deposit-title" className="m-0 text-lg font-semibold">
            定期入账与待确认
          </h3>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            到期只生成待确认记录；确认后才写入现金 Ledger。
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
      </div>
      {(queries.plans.isError || queries.occurrences.isError) && (
        <Alert variant="destructive">
          <AlertTitle>定期入账读取失败</AlertTitle>
          <AlertDescription>计划或待确认记录未更新，请重试。</AlertDescription>
        </Alert>
      )}
      {pending.length > 0 && (
        <Alert>
          <AlertTitle>有 {pending.length} 条入账待确认</AlertTitle>
          <AlertDescription>
            这是应用内待办提醒。请核对实际金额和到账时间；未确认前不会改变现金余额。
          </AlertDescription>
        </Alert>
      )}
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>有 {overdue.length} 条入账已逾期</AlertTitle>
          <AlertDescription>这些待确认实例已超过计划时间，确认前仍不会改变现金余额。</AlertDescription>
        </Alert>
      )}
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>待确认入账</CardTitle>
              <CardDescription>可修改实际金额和到账时间，也可跳过后恢复。</CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant={pending.length > 0 ? 'default' : 'outline'}>
                {pending.length} 条待确认
              </Badge>
              {overdue.length > 0 && <Badge variant="destructive">{overdue.length} 条已逾期</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <Empty className="min-h-32 rounded-none border-0 p-6">
              <EmptyHeader>
                <EmptyTitle>暂无待确认入账</EmptyTitle>
                <EmptyDescription>到期计划会在这里出现，不会自动改变现金余额。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {pending.map((occurrence) => (
                <div
                  key={occurrence.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="block text-sm font-medium">
                        {occurrence.planName} · {occurrence.periodKey}
                      </strong>
                      {isOccurrenceOverdue(occurrence) && <Badge variant="destructive">已逾期</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">
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
                      onClick={() => setOccurrenceAction({ type: 'confirm', occurrence })}
                    >
                      确认入账
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setOccurrenceAction({ type: 'skip', occurrence })}
                    >
                      跳过
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {confirmed.length > 0 && (
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>已确认历史</CardTitle>
            <CardDescription>已确认实例已经写入现金 Ledger。</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {confirmed.map((occurrence) => (
              <div
                key={occurrence.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <strong className="block text-sm font-medium">
                    {occurrence.planName} · {occurrence.periodKey}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    实际{' '}
                    {formatCurrencyAmount(
                      Number(occurrence.actualAmount ?? occurrence.expectedAmount),
                      supportedCurrency(occurrence.currency),
                    )}{' '}
                    · 入账 {formatDate(occurrence.occurredAt)}
                  </span>
                </div>
                <Badge variant="secondary">已确认</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>月度计划</CardTitle>
          <CardDescription>每月日期不存在时自动取月末；暂停期间不会补期。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <Empty className="min-h-32 rounded-none border-0 p-6">
              <EmptyDescription>尚未创建定期入账计划。</EmptyDescription>
            </Empty>
          ) : (
            <div className="divide-y">
              {plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-sm font-medium">{plan.name}</strong>
                      <Badge variant={plan.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {planStatus(plan.status)}
                      </Badge>
                    </div>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      每月 {plan.dayOfMonth} 日 ·{' '}
                      {formatCurrencyAmount(
                        Number(plan.expectedAmount),
                        supportedCurrency(plan.currency),
                      )}
                      {plan.nextDueAt ? ` · 下次 ${formatDate(plan.nextDueAt)}` : ''}
                    </span>
                  </div>
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
                        {plan.status !== 'ENDED' && (
                          <DropdownMenuItem onClick={() => setEditor({ mode: 'edit', plan })}>
                            修改计划
                          </DropdownMenuItem>
                        )}
                        {plan.status === 'ACTIVE' && (
                          <DropdownMenuItem onClick={() => void changePlanState(plan, 'pause')}>
                            暂停计划
                          </DropdownMenuItem>
                        )}
                        {plan.status === 'PAUSED' && (
                          <DropdownMenuItem onClick={() => void changePlanState(plan, 'resume')}>
                            恢复计划
                          </DropdownMenuItem>
                        )}
                        {plan.status !== 'ENDED' && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => void changePlanState(plan, 'end')}
                          >
                            结束计划
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {skipped.length > 0 && (
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>已跳过记录</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {skipped.map((occurrence) => (
              <div
                key={occurrence.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm">
                  {occurrence.planName} · {occurrence.periodKey}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void reopen(occurrence)}
                >
                  恢复待确认
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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

function PlanEditorSheet({
  account,
  editor,
  open,
  onOpenChange,
  onSaved,
}: {
  account: Account;
  editor: PlanEditor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const mutations = useCashOperationsMutations(account.id, account.mode);
  const [name, setName] = useState(editor.plan?.name ?? '工资入账');
  const [amount, setAmount] = useState(editor.plan?.expectedAmount ?? '');
  const [dayOfMonth, setDayOfMonth] = useState(String(editor.plan?.dayOfMonth ?? 1));
  const [startPeriod, setStartPeriod] = useState(currentPeriod);
  const [error, setError] = useState('');
  const pending = mutations.createPlan.isPending || mutations.updatePlan.isPending;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (editor.mode === 'create')
        await mutations.createPlan.mutateAsync({
          accountId: account.id,
          name,
          expectedAmount: amount,
          dayOfMonth: Number(dayOfMonth),
          startPeriod,
          timezone: 'Asia/Shanghai',
        });
      else
        await mutations.updatePlan.mutateAsync({
          id: editor.plan.id,
          input: {
            expectedVersion: editor.plan.version,
            name,
            expectedAmount: amount,
            dayOfMonth: Number(dayOfMonth),
          },
        });
      onSaved();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '计划保存失败。');
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden sm:max-w-[calc(100%-16px)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            {editor.mode === 'create' ? '新建定期入账计划' : '修改定期入账计划'}
          </SheetTitle>
          <SheetDescription>到期仅生成待确认记录，不会自动写入现金余额。</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cash-plan-name">计划名称</FieldLabel>
                <Input
                  id="cash-plan-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-plan-amount">预期金额（{account.currency}）</FieldLabel>
                <Input
                  id="cash-plan-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cash-plan-day">每月日期</FieldLabel>
                <Input
                  id="cash-plan-day"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(event.target.value)}
                />
              </Field>
              {editor.mode === 'create' && (
                <Field>
                  <FieldLabel htmlFor="cash-plan-start">开始月份</FieldLabel>
                  <Input
                    id="cash-plan-start"
                    type="month"
                    value={startPeriod}
                    onChange={(event) => setStartPeriod(event.target.value)}
                  />
                </Field>
              )}
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
          </div>
          <SheetFooter className="border-t bg-popover">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}保存计划
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function OccurrenceActionSheet({
  action,
  open,
  onOpenChange,
  onSaved,
}: {
  action: OccurrenceAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const occurrence = action.occurrence;
  const mutations = useCashOperationsMutations(occurrence.accountId, 'actual');
  const [actualAmount, setActualAmount] = useState(occurrence.expectedAmount);
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [reason, setReason] = useState('本期未到账');
  const [error, setError] = useState('');
  const pending = mutations.confirmOccurrence.isPending || mutations.skipOccurrence.isPending;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (action.type === 'confirm')
        await mutations.confirmOccurrence.mutateAsync({
          id: occurrence.id,
          input: {
            expectedVersion: occurrence.version,
            actualAmount,
            occurredAt: new Date(occurredAt).toISOString(),
          },
        });
      else
        await mutations.skipOccurrence.mutateAsync({
          id: occurrence.id,
          expectedVersion: occurrence.version,
          reason,
        });
      onSaved();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : '操作失败，请刷新后重试。',
      );
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] min-h-0 w-[520px] max-w-[calc(100%-16px)] overflow-hidden sm:max-w-[calc(100%-16px)]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{action.type === 'confirm' ? '确认实际入账' : '跳过本期入账'}</SheetTitle>
          <SheetDescription>
            {occurrence.planName} · {occurrence.periodKey} · 计划{' '}
            {formatCurrencyAmount(
              Number(occurrence.expectedAmount),
              supportedCurrency(occurrence.currency),
            )}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(formEvent) => void submit(formEvent)}
        >
          <div className="flex-1 overflow-y-auto p-4">
            <FieldGroup>
              {action.type === 'confirm' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="cash-occurrence-amount">
                      实际金额（{occurrence.currency}）
                    </FieldLabel>
                    <Input
                      id="cash-occurrence-amount"
                      inputMode="decimal"
                      value={actualAmount}
                      onChange={(event) => setActualAmount(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cash-occurrence-date">实际到账时间</FieldLabel>
                    <DateInput
                      id="cash-occurrence-date"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(event) => setOccurredAt(event.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="cash-occurrence-reason">跳过原因</FieldLabel>
                  <Input
                    id="cash-occurrence-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              )}
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
          </div>
          <SheetFooter className="border-t bg-popover">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant={action.type === 'skip' ? 'outline' : 'default'}
              disabled={pending}
            >
              {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              {action.type === 'confirm' ? '确认并写入 Ledger' : '确认跳过'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
