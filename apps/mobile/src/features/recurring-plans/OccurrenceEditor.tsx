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
import { confirmMonthlyOccurrence, monthlyClient, type OccurrenceDraft } from './plan-api';

export function OccurrenceEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'OccurrenceEditor'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === params.accountId);
  const [occurrence, setOccurrence] = useState(params.occurrence);
  const initial: OccurrenceDraft = {
    amount: occurrence.expectedAmount,
    quantity: '',
    price: '',
    commission: '',
    occurredAt: '',
    reason: '',
  };
  const [form, setForm] = useState(initial);
  const [done, setDone] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const client = monthlyClient(api, params.kind);
  const query = useQuery({
    queryKey: [...scope, 'monthly-occurrences', params.kind, params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => client.getOccurrences({ accountId: params.accountId }, signal),
  });
  useDirtyForm(!done && JSON.stringify(initial) !== JSON.stringify(form), () => setForm(initial));
  const mutation = useMobileCommand(async () => {
    if (params.action === 'confirm')
      return confirmMonthlyOccurrence(api, params.kind, occurrence, form);
    if (params.action === 'skip')
      return client.skipOccurrence(occurrence.id, {
        expectedVersion: occurrence.version,
        reason: form.reason,
      });
    return client.reopenOccurrence(occurrence.id, occurrence.version);
  });
  const latest = query.data?.find((row) => row.id === occurrence.id);
  const expectedStatus = params.action === 'reopen' ? 'SKIPPED' : 'PENDING';
  const blocked =
    done ||
    conflict ||
    mutation.isPending ||
    !account?.active ||
    account.mode !== 'actual' ||
    account.type !== params.kind ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(query) ||
    !latest ||
    latest.version !== occurrence.version ||
    occurrence.accountId !== account.id ||
    latest.status !== expectedStatus;
  const change = (patch: Partial<OccurrenceDraft>) => setForm((value) => ({ ...value, ...patch }));
  const refresh = async () => {
    const result = await query.refetch();
    const row = result.data?.find((item) => item.id === occurrence.id);
    if (result.isError || !row) return;
    if (
      await confirmAction('采用最新发生项版本？', `当前服务端版本 ${row.version}，输入将保留。`)
    ) {
      setOccurrence(row);
      setConflict(false);
    }
  };
  const submit = async () => {
    if (
      blocked ||
      !(await confirmAction(
        '确认本期操作？',
        `${occurrence.planName} ${occurrence.periodKey}，版本 ${occurrence.version}。确认实际发生会写入账本。`,
      ))
    )
      return;
    try {
      const result = await mutation.mutateAsync(undefined);
      setDone(true);
      setFeedback(
        result.refreshFailed
          ? '发生项操作已成功，列表尚未刷新，请勿重复提交。'
          : '发生项状态已更新。',
      );
    } catch (error) {
      if (error instanceof ThesisLedgerApiError && error.status === 409) setConflict(true);
      setFeedback(failureMessage(error));
    }
  };
  const titles = { confirm: '确认本期发生', skip: '跳过本期', reopen: '重开本期' };
  return (
    <Page title={titles[params.action]}>
      <Copy>
        {occurrence.planName} · {occurrence.periodKey} · 版本 {occurrence.version}
      </Copy>
      <Copy muted>
        预计 {occurrence.expectedAmount} {occurrence.currency} · {occurrence.scheduledFor}
      </Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {!done && !mutation.isPending && latest && latest.version !== occurrence.version ? (
        <Feedback message="发生项版本已变化，请显式重新核对后操作。" error />
      ) : null}
      {params.action === 'confirm' ? (
        <>
          {params.kind === 'cash' ? (
            <Field
              label="实际到账金额"
              value={form.amount}
              onChange={(amount) => change({ amount })}
              keyboardType="decimal-pad"
              editable={!mutation.isPending && !done}
            />
          ) : (
            <>
              <Field
                label="实际基金份额"
                value={form.quantity}
                onChange={(quantity) => change({ quantity })}
                keyboardType="decimal-pad"
                editable={!mutation.isPending && !done}
              />
              <Field
                label="实际基金净值"
                value={form.price}
                onChange={(price) => change({ price })}
                keyboardType="decimal-pad"
                editable={!mutation.isPending && !done}
              />
              <Field
                label="定投费用（可选）"
                value={form.commission}
                onChange={(commission) => change({ commission })}
                keyboardType="decimal-pad"
                editable={!mutation.isPending && !done}
              />
            </>
          )}
          <Field
            label={params.kind === 'cash' ? '到账 ISO 时间' : '成交日期 YYYY-MM-DD'}
            value={form.occurredAt}
            onChange={(occurredAt) => change({ occurredAt })}
            editable={!mutation.isPending && !done}
          />
        </>
      ) : null}
      {params.action === 'skip' ? (
        <Field
          label="跳过原因"
          value={form.reason}
          onChange={(reason) => change({ reason })}
          editable={!mutation.isPending && !done}
        />
      ) : null}
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label="重新核对发生项"
        disabled={mutation.isPending || done}
        onPress={() => void refresh()}
      />
      <Action label="确认发生项操作" primary disabled={blocked} onPress={() => void submit()} />
    </Page>
  );
}
