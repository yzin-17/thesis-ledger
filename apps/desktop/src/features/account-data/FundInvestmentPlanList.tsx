import { useEffect, useState } from 'react';
import { partition } from 'es-toolkit';
import { ChevronDownIcon } from 'lucide-react';
import type { RecurringFundInvestmentPlan } from '@thesis-ledger/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrencyAmount, supportedCurrency } from './account-data.helpers.js';

type Plan = RecurringFundInvestmentPlan;
type PlanStateAction = 'pause' | 'resume' | 'end';

export function FundInvestmentPlanList({
  plans,
  busy,
  focusPlanId,
  onEdit,
  onChangeState,
}: {
  plans: Plan[];
  busy: boolean;
  focusPlanId: string | null;
  onEdit: (plan: Plan) => void;
  onChangeState: (plan: Plan, action: PlanStateAction) => void;
}) {
  const [current, ended] = partition(plans, (plan) => plan.status !== 'ENDED');
  const [endedOpen, setEndedOpen] = useState(false);
  const linkedEnded = ended.some((plan) => plan.id === focusPlanId);
  useEffect(() => {
    if (linkedEnded) setEndedOpen(true);
  }, [linkedEnded]);
  useEffect(() => {
    if (focusPlanId)
      document.getElementById(`fund-plan-${focusPlanId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [focusPlanId, endedOpen]);
  const rows = (items: Plan[]) =>
    items.map((plan) => (
      <FundInvestmentPlanRow
        key={plan.id}
        plan={plan}
        busy={busy}
        selected={plan.id === focusPlanId}
        onEdit={onEdit}
        onChangeState={onChangeState}
      />
    ));
  return (
    <div className="space-y-5">
      {current.length > 0 && (
        <section aria-label="当前定投计划" className="space-y-2">
          <h3 className="m-0 text-sm font-semibold">
            当前计划 <span className="font-normal text-muted-foreground">{current.length} 个</span>
          </h3>
          <div className="divide-y divide-border rounded-md border border-border px-3">
            {rows(current)}
          </div>
        </section>
      )}
      {plans.length === 0 && <p className="m-0 text-sm text-muted-foreground">暂无定投计划</p>}
      {ended.length > 0 && (
        <details
          className="rounded-md border border-border px-3"
          open={endedOpen}
          onToggle={(event) => setEndedOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium">
            <span>已结束计划 · {ended.length} 个</span>
            <ChevronDownIcon
              className={cn('size-4 transition-transform', endedOpen && 'rotate-180')}
            />
          </summary>
          <div className="divide-y divide-border border-t border-border">{rows(ended)}</div>
        </details>
      )}
    </div>
  );
}

function FundInvestmentPlanRow({
  plan,
  busy,
  selected,
  onEdit,
  onChangeState,
}: {
  plan: Plan;
  busy: boolean;
  selected: boolean;
  onEdit: (plan: Plan) => void;
  onChangeState: (plan: Plan, action: PlanStateAction) => void;
}) {
  let status = '进行中';
  if (plan.status === 'PAUSED') status = '已暂停';
  else if (plan.status === 'ENDED') status = '已结束';
  return (
    <div
      id={`fund-plan-${plan.id}`}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 py-3',
        selected && 'rounded-md bg-muted/50 px-3',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-medium">{plan.name}</strong>
          <Badge variant="secondary">{status}</Badge>
          {selected && <span className="text-xs text-muted-foreground">所选成交对应计划</span>}
        </div>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          {plan.fundName} · {plan.symbol} · 每月 {plan.dayOfMonth} 日 ·{' '}
          {formatCurrencyAmount(Number(plan.expectedAmount), supportedCurrency(plan.currency))}
        </p>
      </div>
      {plan.status !== 'ENDED' && (
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onEdit(plan)}
          >
            编辑
          </Button>
          {plan.status === 'ACTIVE' && (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onChangeState(plan, 'pause')}
            >
              暂停
            </Button>
          )}
          {plan.status === 'PAUSED' && (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onChangeState(plan, 'resume')}
            >
              恢复
            </Button>
          )}
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onChangeState(plan, 'end')}
          >
            结束
          </Button>
        </div>
      )}
    </div>
  );
}
