import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { AccountStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import { canUseReadForWrite } from '../../app/query/query-state';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { CashEventView } from '../cash-observations/CashEventView';
import { isTransfer } from './transfer-command';

export function TransfersScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Transfers'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === params.accountId);
  const query = useQuery({
    queryKey: [...scope, 'transfer-audit', params.accountId],
    enabled: Boolean(account),
    queryFn: () => api.ledger.getEventAudit(params.accountId),
  });
  const events = query.data?.events ?? [];
  const facts = new Map(events.filter(isTransfer).map((event) => [event.factId, event]));
  const writable =
    Boolean(account?.active && account.mode === 'actual') &&
    canUseReadForWrite(accounts) &&
    canUseReadForWrite(query);
  return (
    <Page
      title="划转与更正"
      action={
        <Action
          label="新增划转"
          disabled={!writable}
          onPress={() => navigation.navigate('TransferEditor', params)}
        />
      }
    >
      <Copy>{account?.name ?? '账户不在当前范围'}</Copy>
      <QueryStatus query={query} empty={facts.size === 0} retry={() => void query.refetch()} />
      {[...facts.values()].map((event) => {
        const tip = events
          .filter((row) => row.factId === event.factId)
          .reduce((a, b) => (BigInt(a.ledgerRevision) > BigInt(b.ledgerRevision) ? a : b));
        const go = (action: 'replace' | 'void' | 'restore') =>
          navigation.navigate('TransferEditor', { ...params, event, action });
        return (
          <Section key={event.factId}>
            <CashEventView event={event} />
            {tip.revisionAction === 'VOID' ? (
              <Action label="恢复划转" disabled={!writable} onPress={() => go('restore')} />
            ) : (
              <>
                <Action label="更正划转" disabled={!writable} onPress={() => go('replace')} />
                <Action
                  label="作废划转"
                  disabled={!writable}
                  destructive
                  onPress={() => go('void')}
                />
              </>
            )}
            <Copy muted>
              当前链顶修订 {tip.ledgerRevision} · {tip.eventId}
            </Copy>
          </Section>
        );
      })}
    </Page>
  );
}
