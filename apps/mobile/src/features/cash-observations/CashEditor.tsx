import { useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import type { AccountStackParams } from '../../app/navigation-types';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useLedger, useMobileCommand } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import {
  buildCashDeposit,
  buildCashObservation,
  initialCashForm,
  type CashForm,
} from './cash-command';

export function CashEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'CashEditor'>>();
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const initial = useRef(initialCashForm(account?.currency ?? 'CNY')).current;
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{ key: string; id: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useDirtyForm(dirty, () => setForm(saved));
  const observation = params.kind === 'observation';
  const mutation = useMobileCommand(async (input: CashForm) => {
    if (!account) throw new Error('账户不在当前范围。');
    if (observation)
      return api.cash.recordBalance(buildCashObservation(input, account.id, Date.now()));
    const key = JSON.stringify(input);
    if (prepared.current?.key !== key) prepared.current = { key, id: Crypto.randomUUID() };
    return api.ledger.createCashFlow(buildCashDeposit(input, account, prepared.current.id));
  });
  const allowed = observation || (account?.mode === 'actual' && account.type === 'cash');
  const blocked =
    mutation.isPending ||
    !account?.active ||
    !allowed ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(ledger);
  const change = (patch: Partial<CashForm>) => {
    setForm((value) => ({ ...value, ...patch }));
    setFeedback(null);
  };
  const submit = async () => {
    if (blocked || !dirty) return;
    try {
      const result = await mutation.mutateAsync(form);
      setSaved(form);
      setFeedback(
        result.refreshFailed ? '已记录，余额或流水尚未刷新，请勿重复提交。' : '现金记录已保存。',
      );
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title={observation ? '记录现金快照' : '现金入账'}>
      <Copy>
        {account?.name ?? '读取账户中'} · 账本修订 {ledger.data?.ledgerRevision ?? '—'}
      </Copy>
      <Copy muted>
        {observation
          ? '快照记录观察到的已结算余额，不作为新增现金流。'
          : '实际到账金额、日期与账户币种须一致。'}
      </Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={ledger} retry={() => void ledger.refetch()} />
      {!allowed ? <Feedback message="手工入账只支持启用的实际现金账户。" error /> : null}
      <Field
        label={observation ? '已结算余额' : '入账金额'}
        value={form.amount}
        onChange={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        editable={!blocked}
      />
      <Choices
        label="现金币种"
        value={form.currency}
        options={[
          { value: 'CNY', label: '人民币' },
          { value: 'HKD', label: '港币' },
          { value: 'USD', label: '美元' },
        ]}
        onChange={(currency) => change({ currency })}
        disabled={blocked || !observation}
      />
      <Field
        label={observation ? '快照 ISO 时间' : '入账 ISO 时间'}
        value={form.occurredAt}
        onChange={(occurredAt) => change({ occurredAt })}
        editable={!blocked}
      />
      {!observation ? (
        <>
          <Field
            label="预计结算 ISO 时间（可选）"
            value={form.expectedAt}
            onChange={(expectedAt) => change({ expectedAt })}
            editable={!blocked}
          />
          <Field
            label="实际结算 ISO 时间（可选）"
            value={form.settledAt}
            onChange={(settledAt) => change({ settledAt })}
            editable={!blocked}
          />
          <Field
            label="现金备注（可选）"
            value={form.note}
            onChange={(note) => change({ note })}
            editable={!blocked}
          />
        </>
      ) : null}
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label={mutation.isPending ? '记录中…' : '保存现金记录'}
        disabled={blocked || !dirty}
        primary
        onPress={() => void submit()}
      />
    </Page>
  );
}
