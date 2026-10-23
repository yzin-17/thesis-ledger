import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { accountInputSchema } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
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
import type { AccountStackParams } from '../../app/navigation-types';

export function AccountEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'AccountEditor'>>();
  const account = params.account;
  const runtime = useMobileRuntime();
  const accounts = useAccounts();
  const initial = {
    name: account?.name ?? '',
    institution: account?.institution ?? '',
    type: account?.type ?? ('securities' as const),
    currency: account?.currency ?? ('CNY' as const),
  };
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [accountId, setAccountId] = useState(account?.id);
  const [feedback, setFeedback] = useState<string | null>(null);
  const updateDraft = (patch: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFeedback(null);
  };
  const readable =
    accounts.isSuccess &&
    !accounts.isFetching &&
    (!accountId ||
      accounts.data.some((item) => item.id === accountId && item.mode === runtime.mode));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const discard = () => setDraft(saved);
  useDirtyForm(dirty, discard);
  const mutation = useMobileCommand((input: typeof draft) =>
    runtime.api.accounts.save({ ...input, mode: runtime.mode }, accountId),
  );
  const save = async () => {
    if (mutation.isPending || !readable) return;
    const validated = accountInputSchema.safeParse({ ...draft, mode: runtime.mode });
    if (!validated.success) {
      setFeedback('请填写账户名称，并核对类型和币种。');
      return;
    }
    try {
      const result = await mutation.mutateAsync(draft);
      const value = result.result;
      const savedDraft = {
        name: value.name,
        institution: value.institution ?? '',
        type: value.type,
        currency: value.currency,
      };
      setAccountId(value.id);
      setDraft(savedDraft);
      setSaved(savedDraft);
      setFeedback(result.refreshFailed ? '账户已保存，列表尚未刷新。' : '账户已保存。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title={accountId ? '编辑账户' : '新建账户'}>
      <Copy muted>{runtime.mode === 'shadow' ? '模拟账户' : '实际账户'}</Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      {accounts.isSuccess && !accounts.isFetching && !readable ? (
        <Feedback message="账户已不在当前范围，请返回账户列表重新选择。" error />
      ) : null}
      <Field
        label="账户名称"
        value={draft.name}
        onChange={(name) => updateDraft({ name })}
        editable={!mutation.isPending}
      />
      <Field
        label="机构（可选）"
        value={draft.institution}
        onChange={(institution) => updateDraft({ institution })}
        editable={!mutation.isPending}
      />
      <Choices
        label="账户类型"
        value={draft.type}
        options={[
          { value: 'securities', label: '证券' },
          { value: 'fund', label: '基金' },
          { value: 'cash', label: '现金' },
        ]}
        onChange={(type) => updateDraft({ type })}
        disabled={mutation.isPending}
      />
      <Choices
        label="币种"
        value={draft.currency}
        options={[
          { value: 'CNY', label: '人民币' },
          { value: 'HKD', label: '港币' },
          { value: 'USD', label: '美元' },
        ]}
        onChange={(currency) => updateDraft({ currency })}
        disabled={mutation.isPending}
      />
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label={mutation.isPending ? '保存中…' : '保存账户'}
        primary
        disabled={mutation.isPending || !dirty || !readable}
        onPress={() => void save()}
      />
    </Page>
  );
}
