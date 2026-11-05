import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
import { isFundInvestmentInstrument } from '../recurring-funds/fund-plan';
import { monthlyClient, saveMonthlyPlan, type MonthlyPlanDraft } from './plan-api';

export function PlanEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'PlanEditor'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === params.accountId);
  const [plan, setPlan] = useState(params.plan);
  const initial: MonthlyPlanDraft = {
    name: plan?.name ?? '',
    amount: plan?.expectedAmount ?? '',
    day: String(plan?.dayOfMonth ?? 1),
    startPeriod: plan?.startPeriod ?? '',
    symbol: plan && 'symbol' in plan ? plan.symbol : '',
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const client = monthlyClient(api, params.kind);
  const query = useQuery({
    queryKey: [...scope, 'monthly-plans', params.kind, params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => client.getPlans({ accountId: params.accountId }, signal),
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useDirtyForm(dirty, () => setForm(saved));
  const mutation = useMobileCommand(async () => {
    if (!account) throw new Error('账户不在当前范围。');
    return saveMonthlyPlan(api, params.kind, form, account, plan);
  });
  const blocked =
    mutation.isPending ||
    uncertain ||
    conflict ||
    !account?.active ||
    account.mode !== 'actual' ||
    account.type !== params.kind ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(query) ||
    Boolean(plan && (plan.accountId !== account.id || plan.status === 'ENDED'));
  const change = (patch: Partial<MonthlyPlanDraft>) => setForm((value) => ({ ...value, ...patch }));
  const submit = async () => {
    if (blocked || !dirty) return;
    try {
      const result = await mutation.mutateAsync(undefined);
      setPlan(result.result);
      setSaved(form);
      setFeedback(
        result.refreshFailed ? '计划已保存，列表尚未刷新，请勿重复提交。' : '月度计划已保存。',
      );
    } catch (error) {
      if (error instanceof ThesisLedgerApiError && error.status === 409) setConflict(true);
      if (
        !plan &&
        !(error instanceof ThesisLedgerApiError && error.status >= 400 && error.status < 500)
      )
        setUncertain(true);
      setFeedback(failureMessage(error));
    }
  };
  const reconcile = async () => {
    const result = await query.refetch();
    if (result.isError || !result.data) return;
    if (
      uncertain &&
      result.data.some((row) => row.name === form.name && row.expectedAmount === form.amount)
    ) {
      setFeedback('已发现同名同金额计划，请返回列表核对后编辑，避免重复创建。');
      return;
    }
    if (
      !(await confirmAction(
        '确认采用最新读取结果？',
        '输入会保留；请先核对是否已经保存。版本冲突不会自动重试。',
      ))
    )
      return;
    if (plan) {
      const latest = result.data.find((row) => row.id === plan.id);
      if (!latest) {
        setFeedback('原计划已不可读取，请返回列表。');
        return;
      }
      setPlan(latest);
    }
    setUncertain(false);
    setConflict(false);
    setFeedback('已重新读取，请核对输入后保存。');
  };
  return (
    <Page title={plan ? '编辑月度计划' : '新建月度计划'}>
      <Copy>
        {account?.name ?? '账户不在当前范围'} · {account?.currency ?? '—'} · 版本{' '}
        {plan?.version ?? '新计划'}
      </Copy>
      <Copy muted>时区为 Asia/Shanghai，月份为 YYYY-MM，每月日期为 1～31。</Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {params.kind === 'fund' && !plan ? (
        <InstrumentPicker
          onConfirmed={(item) => {
            if (!isFundInvestmentInstrument(item)) {
              setFeedback('请选择场外基金（000000.OF）。');
              return;
            }
            setFeedback(null);
            change({ symbol: item.symbol });
          }}
        />
      ) : null}
      {params.kind === 'fund' ? <Copy>定投基金 {form.symbol || '请先确认目录基金'}</Copy> : null}
      <Field
        label="月度计划名称"
        value={form.name}
        onChange={(name) => change({ name })}
        editable={!mutation.isPending}
      />
      <Field
        label="每期预计金额"
        value={form.amount}
        onChange={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        editable={!mutation.isPending}
      />
      <Field
        label="每月日期"
        value={form.day}
        onChange={(day) => change({ day })}
        keyboardType="number-pad"
        editable={!mutation.isPending}
      />
      <Field
        label="起始月份"
        value={form.startPeriod}
        onChange={(startPeriod) => change({ startPeriod })}
        editable={!mutation.isPending && !plan}
      />
      <Feedback message={feedback} error={mutation.isError || uncertain} />
      <Action
        label="重新核对计划"
        disabled={mutation.isPending || query.isFetching}
        onPress={() => void reconcile()}
      />
      <Action
        label="保存月度计划"
        disabled={blocked || !dirty || (params.kind === 'fund' && !form.symbol)}
        primary
        onPress={() => void submit()}
      />
    </Page>
  );
}
