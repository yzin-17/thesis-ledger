import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAccounts, useLedger, useValuation } from '../../app/query/mobile-queries';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import type { AccountStackParams } from '../../app/navigation-types';

export function AccountWorkspace() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'AccountWorkspace'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const valuation = useValuation(account?.id, Boolean(account));
  const writable = Boolean(account?.active) && !accounts.isError && !accounts.isFetching;
  return (
    <Page title={account?.name ?? '账户数据'}>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      {!accounts.isPending && !account ? (
        <Copy>账户不在当前范围内，请返回账户列表重新选择。</Copy>
      ) : null}
      {account ? (
        <>
          <Copy muted>
            {account.currency} · {account.active ? '启用中' : '已停用'} · 账本修订{' '}
            {ledger.data?.ledgerRevision ?? '读取中'}
          </Copy>
          {!writable ? <Copy muted>当前账户尚不可写，请确认启用状态并重新读取。</Copy> : null}
          <Section title="持仓与导入">
            <Action
              label="人工录入持仓"
              disabled={!writable || account.type === 'cash'}
              onPress={() => navigation.navigate('Baseline', params)}
            />
            <Action label="持仓草稿与截图" onPress={() => navigation.navigate('Drafts', params)} />
            <Action
              label="确定性对账"
              onPress={() => navigation.navigate('Reconciliation', params)}
            />
          </Section>
          <Section title="成交与审计">
            <Action label="现金与结算" onPress={() => navigation.navigate('Cash', params)} />
            {account.type === 'cash' ? (
              <Action
                label="定期入账"
                onPress={() => navigation.navigate('Plans', { ...params, kind: 'cash' })}
              />
            ) : null}
            {account.type === 'fund' ? (
              <Action
                label="基金定投"
                onPress={() => navigation.navigate('Plans', { ...params, kind: 'fund' })}
              />
            ) : null}
            <Action label="成交记录" onPress={() => navigation.navigate('Executions', params)} />
            <Action
              label="新增成交"
              disabled={!writable || account.type === 'cash'}
              onPress={() => navigation.navigate('ExecutionEditor', params)}
            />
            <Action label="账本审计" onPress={() => navigation.navigate('Audit', params)} />
          </Section>
          <QueryStatus query={valuation} retry={() => void valuation.refetch()} />
          {valuation.data?.positions.map((position) => (
            <Section key={position.id} title={position.asset?.name ?? position.symbol}>
              <Copy>
                {position.symbol} · 数量 {position.quantity} · 成本 {position.costPrice}{' '}
                {typeof position.currency === 'string' ? position.currency : account.currency}
              </Copy>
              <Copy muted>{position.stale ? '行情陈旧' : '已估值'}</Copy>
            </Section>
          ))}
        </>
      ) : null}
    </Page>
  );
}
