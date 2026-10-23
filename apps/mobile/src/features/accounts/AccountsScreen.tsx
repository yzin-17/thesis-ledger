import { useState } from 'react';
import type { AccountResponse } from '@thesis-ledger/api-client';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
import { confirmAction, showMessage, useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import type { AccountStackParams } from '../../app/navigation-types';

const typeLabels = { securities: '证券账户', fund: '基金账户', cash: '现金账户' };
export function AccountsScreen() {
  const runtime = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const query = useAccounts();
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const readable = query.isSuccess && !query.isFetching;
  const term = search.trim().toLowerCase();
  const accounts = query.data?.filter((account) =>
    `${account.name}\n${account.institution ?? ''}`.toLowerCase().includes(term),
  );
  const mutation = useMobileCommand(
    async ({ account, permanent }: { account: AccountResponse; permanent: boolean }) => {
      if (permanent) await runtime.api.accounts.permanentDelete(account.id);
      else await runtime.api.accounts.setActive(account.id, !account.active);
    },
  );
  const change = async (account: AccountResponse, permanent: boolean) => {
    if (mutation.isPending || !readable) return;
    const title = permanent
      ? `永久删除账户“${account.name}”？`
      : `更改账户“${account.name}”的状态？`;
    if (
      !(await confirmAction(
        title,
        permanent
          ? '删除后无法恢复。存在历史关联的账户会被服务端拒绝删除。'
          : '停用账户保留历史数据，可以重新启用。',
        permanent,
      ))
    )
      return;
    try {
      const result = await mutation.mutateAsync({ account, permanent });
      if (permanent && runtime.accountId === account.id) await runtime.changeAccount(null);
      setFeedback(result.refreshFailed ? '操作已成功，列表尚未刷新，请重新读取。' : '账户已更新。');
      if (result.refreshFailed)
        showMessage('账户操作已成功', `${account.name}\n列表尚未刷新，请重新读取。`);
    } catch (error) {
      const message = failureMessage(error);
      setFeedback(message);
      showMessage('账户操作未完成', `${account.name}\n${message}`);
    }
  };
  return (
    <Page
      title="账户"
      action={<Action label="新建账户" onPress={() => navigation.navigate('AccountEditor', {})} />}
    >
      <Copy muted>{runtime.mode === 'shadow' ? '模拟账户' : '实际账户'} · 包含已停用账户</Copy>
      <Field label="按名称或机构筛选" value={search} onChange={setSearch} />
      {search ? <Action label="清除筛选" onPress={() => setSearch('')} /> : null}
      <Feedback message={feedback} error={mutation.isError} />
      <QueryStatus
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
      />
      {query.isSuccess && query.data.length > 0 && accounts?.length === 0 ? (
        <Copy muted>没有匹配的账户。</Copy>
      ) : null}
      {accounts?.map((account) => (
        <Section key={account.id} title={account.name}>
          <Copy muted>
            {typeLabels[account.type]} · {account.currency} · {account.active ? '启用中' : '已停用'}
          </Copy>
          <Copy muted>{account.institution || '未填写机构'}</Copy>
          <Action
            label="查看账户数据"
            disabled={mutation.isPending}
            onPress={() =>
              void runtime.changeAccount(account.id).then((ok) => {
                if (ok) navigation.navigate('AccountWorkspace', { accountId: account.id });
              })
            }
          />
          <Action
            label="编辑账户"
            disabled={mutation.isPending}
            onPress={() => navigation.navigate('AccountEditor', { account })}
          />
          <Action
            label={account.active ? '停用账户' : '重新启用'}
            disabled={mutation.isPending || !readable}
            onPress={() => void change(account, false)}
          />
          <Action
            label="永久删除"
            destructive
            disabled={mutation.isPending || !readable}
            onPress={() => void change(account, true)}
          />
        </Section>
      ))}
    </Page>
  );
}
