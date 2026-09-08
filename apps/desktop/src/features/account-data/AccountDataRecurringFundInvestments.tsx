import { useState, type FormEvent } from 'react';
import type {
  RecurringFundInvestmentOccurrence,
  RecurringFundInvestmentPlan,
} from '@thesis-ledger/api-client';
import { LoaderCircle, PlusIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
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
  formatCurrencyAmount,
  formatDate,
  isPositiveDecimal,
  supportedCurrency,
} from './account-data.helpers.js';
import {
  useFundInvestmentMutations,
  useFundInvestmentQueries,
} from './account-data.fund-investment.queries.js';

type PlanEditor =
  { mode: 'create'; plan: null } | { mode: 'edit'; plan: RecurringFundInvestmentPlan };
type OccurrenceAction = { type: 'confirm' | 'skip'; occurrence: RecurringFundInvestmentOccurrence };
type FundMutations = ReturnType<typeof useFundInvestmentMutations>;

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const currentDate = () => new Date().toISOString().slice(0, 10);
const planStatus = (status: RecurringFundInvestmentPlan['status']) => {
  if (status === 'ACTIVE') return '启用';
  if (status === 'PAUSED') return '已暂停';
  return '已结束';
};

export function RecurringFundInvestments({ account }: { account: Account }) {
  const enabled = account.type === 'fund' && account.mode === 'actual' && account.active !== false;
  const queries = useFundInvestmentQueries(account.id, enabled);
  const mutations = useFundInvestmentMutations(account.id);
  const toast = useToastManager();
  const [editor, setEditor] = useState<PlanEditor | null>(null);
  const [action, setAction] = useState<OccurrenceAction | null>(null);
  const plans = queries.plans.data ?? [];
  const occurrences = queries.occurrences.data ?? [];
  const pending = occurrences.filter((item) => item.status === 'PENDING');
  const skipped = occurrences.filter((item) => item.status === 'SKIPPED');
  if (!enabled) return null;

  const changePlanState = async (
    plan: RecurringFundInvestmentPlan,
    next: 'pause' | 'resume' | 'end',
  ) => {
    try {
      await mutations.changePlanState.mutateAsync({
        id: plan.id,
        action: next,
        expectedVersion: plan.version,
      });
      toast.add({ title: '定投计划已更新', type: 'success' });
    } catch (error) {
      toast.add({
        title: '计划操作失败',
        description: error instanceof Error ? error.message : '请刷新后重试。',
        type: 'error',
      });
    }
  };

  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-6"
      aria-labelledby="fund-investment-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="fund-investment-title" className="m-0 text-lg font-semibold">
            基金定投
          </h3>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            到期先生成待确认记录，核对实际份额和净值后才记为买入成交。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditor({ mode: 'create', plan: null })}
        >
          <PlusIcon data-icon="inline-start" />
          新建定投
        </Button>
      </header>
      {(queries.plans.isError || queries.occurrences.isError) && (
        <Alert variant="destructive">
          <AlertTitle>基金定投读取失败</AlertTitle>
          <AlertDescription>计划或待确认记录未更新，请重试。</AlertDescription>
        </Alert>
      )}
      <div className="divide-y border-y border-border">
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <h4 className="m-0 text-sm font-semibold">待确认成交</h4>
            <p className="m-0 mt-1 text-xs text-muted-foreground">确认前不会改变持仓或现金。</p>
          </div>
          <Badge variant={pending.length > 0 ? 'default' : 'secondary'}>{pending.length} 条</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="m-0 py-3 text-sm text-muted-foreground">暂无待确认定投</p>
        ) : (
          pending.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <strong className="text-sm font-medium">
                  {item.fundName} · {item.periodKey}
                </strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.symbol} · 计划 {formatDate(item.scheduledFor)} ·{' '}
                  {formatCurrencyAmount(
                    Number(item.expectedAmount),
                    supportedCurrency(item.currency),
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  type="button"
                  onClick={() => setAction({ type: 'confirm', occurrence: item })}
                >
                  确认成交
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setAction({ type: 'skip', occurrence: item })}
                >
                  跳过
                </Button>
              </div>
            </div>
          ))
        )}
        <div className="flex items-center justify-between gap-3 py-3">
          <h4 className="m-0 text-sm font-semibold">定投计划</h4>
          <span className="text-sm text-muted-foreground">{plans.length} 个</span>
        </div>
        {plans.length === 0 ? (
          <p className="m-0 py-3 text-sm text-muted-foreground">暂无基金定投计划</p>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-medium">{plan.name}</strong>
                  <Badge variant="secondary">{planStatus(plan.status)}</Badge>
                </div>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {plan.fundName} · {plan.symbol} · 每月 {plan.dayOfMonth} 日 ·{' '}
                  {formatCurrencyAmount(
                    Number(plan.expectedAmount),
                    supportedCurrency(plan.currency),
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {plan.status !== 'ENDED' && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setEditor({ mode: 'edit', plan })}
                  >
                    编辑
                  </Button>
                )}
                {plan.status === 'ACTIVE' && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void changePlanState(plan, 'pause')}
                  >
                    暂停
                  </Button>
                )}
                {plan.status === 'PAUSED' && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void changePlanState(plan, 'resume')}
                  >
                    恢复
                  </Button>
                )}
                {plan.status !== 'ENDED' && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void changePlanState(plan, 'end')}
                  >
                    结束
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        {skipped.length > 0 && (
          <div className="flex flex-col gap-2 py-3">
            <h4 className="m-0 text-sm font-semibold">已跳过</h4>
            {skipped.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {item.fundName} · {item.periodKey}
                </span>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void mutations.reopenOccurrence.mutateAsync({
                      id: item.id,
                      expectedVersion: item.version,
                    })
                  }
                >
                  恢复待确认
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {editor && (
        <FundInvestmentPlanSheet
          key={editor.plan?.id ?? 'create'}
          account={account}
          editor={editor}
          onClose={() => setEditor(null)}
          mutations={mutations}
        />
      )}
      {action && (
        <FundInvestmentOccurrenceSheet
          key={action.occurrence.id + action.type}
          action={action}
          onClose={() => setAction(null)}
          mutations={mutations}
        />
      )}
    </section>
  );
}

function FundInvestmentPlanSheet({
  account,
  editor,
  onClose,
  mutations,
}: {
  account: Account;
  editor: PlanEditor;
  onClose: () => void;
  mutations: FundMutations;
}) {
  const plan = editor.plan;
  const [name, setName] = useState(plan?.name ?? '每月基金定投');
  const [symbol, setSymbol] = useState(plan?.symbol ?? '');
  const [amount, setAmount] = useState(plan?.expectedAmount ?? '1000');
  const [day, setDay] = useState(String(plan?.dayOfMonth ?? 1));
  const [startPeriod, setStartPeriod] = useState(plan?.startPeriod ?? currentPeriod());
  const [error, setError] = useState<string | null>(null);
  const busy = mutations.createPlan.isPending || mutations.updatePlan.isPending;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedSymbol = symbol.trim().toUpperCase();
    const dayOfMonth = Number(day);
    if (!name.trim() || !/^\d{6}\.OF$/.test(normalizedSymbol) || !isPositiveDecimal(amount)) {
      setError('请填写计划名称、规范基金代码和大于 0 的金额。');
      return;
    }
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      setError('每月日期必须是 1–31。');
      return;
    }
    try {
      if (plan)
        await mutations.updatePlan.mutateAsync({
          id: plan.id,
          input: {
            expectedVersion: plan.version,
            name: name.trim(),
            expectedAmount: amount,
            dayOfMonth,
          },
        });
      else
        await mutations.createPlan.mutateAsync({
          accountId: account.id,
          name: name.trim(),
          symbol: normalizedSymbol,
          expectedAmount: amount,
          dayOfMonth,
          startPeriod,
          timezone: 'Asia/Shanghai',
        });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '计划保存失败，请重试。');
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" size="form">
        <SheetHeader>
          <SheetTitle>{plan ? '编辑基金定投' : '新建基金定投'}</SheetTitle>
          <SheetDescription>到期只生成待确认记录，不会自动下单或写入成交。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fund-plan-name">计划名称</FieldLabel>
              <Input
                id="fund-plan-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fund-plan-symbol">基金代码</FieldLabel>
              <Input
                id="fund-plan-symbol"
                value={symbol}
                disabled={Boolean(plan)}
                placeholder="例如 000001.OF"
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fund-plan-amount">每月计划金额</FieldLabel>
              <Input
                id="fund-plan-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="fund-plan-day">每月日期</FieldLabel>
              <Input
                id="fund-plan-day"
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </Field>
            {!plan && (
              <Field>
                <FieldLabel htmlFor="fund-plan-start">开始月份</FieldLabel>
                <DateInput
                  id="fund-plan-start"
                  type="month"
                  value={startPeriod}
                  onChange={(event) => setStartPeriod(event.target.value)}
                />
              </Field>
            )}
            {error && (
              <Field invalid>
                <FieldError>{error}</FieldError>
              </Field>
            )}
          </FieldGroup>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {plan ? '保存修改' : '创建计划'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FundInvestmentOccurrenceSheet({
  action,
  onClose,
  mutations,
}: {
  action: OccurrenceAction;
  onClose: () => void;
  mutations: FundMutations;
}) {
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [commission, setCommission] = useState('');
  const [occurredAt, setOccurredAt] = useState(currentDate());
  const [reason, setReason] = useState('本期未执行');
  const [error, setError] = useState<string | null>(null);
  const busy = mutations.confirmOccurrence.isPending || mutations.skipOccurrence.isPending;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (action.type === 'skip') {
        if (!reason.trim()) {
          setError('请填写跳过原因。');
          return;
        }
        await mutations.skipOccurrence.mutateAsync({
          id: action.occurrence.id,
          expectedVersion: action.occurrence.version,
          reason: reason.trim(),
        });
      } else {
        if (!isPositiveDecimal(quantity) || !isPositiveDecimal(unitPrice)) {
          setError('实际份额和单位净值必须大于 0。');
          return;
        }
        if (commission && !isPositiveDecimal(commission)) {
          setError('手续费必须大于 0，或留空。');
          return;
        }
        await mutations.confirmOccurrence.mutateAsync({
          id: action.occurrence.id,
          input: {
            expectedVersion: action.occurrence.version,
            actualQuantity: quantity,
            unitPrice,
            ...(commission ? { commission } : {}),
            occurredAt,
          },
        });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败，请重试。');
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" size="form">
        <SheetHeader>
          <SheetTitle>{action.type === 'skip' ? '跳过本期定投' : '确认定投成交'}</SheetTitle>
          <SheetDescription>
            {action.occurrence.fundName} · {action.occurrence.periodKey}
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-5" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            {action.type === 'skip' ? (
              <Field>
                <FieldLabel htmlFor="fund-skip-reason">跳过原因</FieldLabel>
                <Input
                  id="fund-skip-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="fund-actual-quantity">实际确认份额</FieldLabel>
                  <Input
                    id="fund-actual-quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fund-unit-price">单位净值</FieldLabel>
                  <Input
                    id="fund-unit-price"
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fund-commission">手续费（可选）</FieldLabel>
                  <Input
                    id="fund-commission"
                    inputMode="decimal"
                    value={commission}
                    onChange={(event) => setCommission(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fund-occurred-at">成交日期</FieldLabel>
                  <DateInput
                    id="fund-occurred-at"
                    type="date"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.target.value)}
                  />
                </Field>
              </>
            )}
            {error && (
              <Field invalid>
                <FieldError>{error}</FieldError>
              </Field>
            )}
          </FieldGroup>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {action.type === 'skip' ? '确认跳过' : '写入买入成交'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
