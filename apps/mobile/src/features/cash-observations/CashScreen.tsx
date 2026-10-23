import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AccountStackParams } from '../../app/navigation-types';
import { useAccounts, useLedger, useValuation } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { CashEventView } from './CashEventView';

export function CashScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Cash'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const valuation = useValuation(account?.id, Boolean(account));
  const [limit, setLimit] = useState(30);
  const events =
    ledger.data?.events.filter(
      (event) => event.type === 'CASH_FLOW' || event.type === 'CASH_BALANCE_OBSERVATION',
    ) ?? [];
  const writable =
    Boolean(account?.active) && canUseReadForWrite(accounts) && canUseReadForWrite(ledger);
  return (
    <Page
      title="现金与结算"
      action={
        <Action
          label="刷新现金"
          disabled={ledger.isFetching || valuation.isFetching}
          onPress={() => void Promise.all([ledger.refetch(), valuation.refetch()])}
        />
      }
    >
      <Copy>
        {account?.name ?? '账户不在当前范围'} · 账本修订 {ledger.data?.ledgerRevision ?? '—'}
      </Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <QueryStatus query={valuation} retry={() => void valuation.refetch()} />
      <Section title="已结算余额">
        {(valuation.data?.cashByCurrency ?? []).map((row) => (
          <Copy key={row.currency}>
            {row.amount} {row.currency}
          </Copy>
        ))}
        {!valuation.data?.cashByCurrency?.length ? <Copy muted>暂无币种余额。</Copy> : null}
        {valuation.data?.partial ? (
          <Copy muted>部分估值或汇率不完整；请核对来源后使用。</Copy>
        ) : null}
      </Section>
      <Action
        label="记录现金快照"
        disabled={!writable}
        onPress={() => navigation.navigate('CashEditor', { ...params, kind: 'observation' })}
      />
      <Action
        label="现金入账"
        disabled={!writable || account?.mode !== 'actual' || account.type !== 'cash'}
        onPress={() => navigation.navigate('CashEditor', { ...params, kind: 'deposit' })}
      />
      <Copy muted>现金流与计划按现行规则仅支持相应类型的实际账户。</Copy>
      <Action label="划转与更正" onPress={() => navigation.navigate('Transfers', params)} />
      <QueryStatus query={ledger} empty={events.length === 0} retry={() => void ledger.refetch()} />
      {events
        .slice()
        .reverse()
        .slice(0, limit)
        .map((event) => (
          <CashEventView key={event.eventId} event={event} />
        ))}
      {events.length > limit ? (
        <Action label="更多现金流水" onPress={() => setLimit((value) => value + 30)} />
      ) : null}
      <Action label="查看现金审计" onPress={() => navigation.navigate('Audit', params)} />
    </Page>
  );
}
