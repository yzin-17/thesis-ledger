import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { AccountStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import { Action, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { isExecution } from './execution-command';
import { LedgerEventView } from './LedgerEventView';
export function AuditScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Audit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === params.accountId);
  const query = useQuery({
    queryKey: [...scope, 'audit', params.accountId],
    enabled: Boolean(account),
    queryFn: () => api.ledger.getEventAudit(params.accountId),
  });
  const events = query.data?.events ?? [];
  return (
    <Page title="账本审计">
      <QueryStatus query={query} empty={events.length === 0} retry={() => void query.refetch()} />
      {events.map((event) => {
        const latest = events
          .filter((row) => row.factId === event.factId)
          .reduce((a, b) => (BigInt(a.ledgerRevision) > BigInt(b.ledgerRevision) ? a : b), event);
        const previous = events
          .filter((row) => row.factId === event.factId && isExecution(row))
          .reduce<typeof event | null>(
            (a, b) => (!a || BigInt(a.ledgerRevision) < BigInt(b.ledgerRevision) ? b : a),
            null,
          );
        const restorable =
          latest.eventId === event.eventId &&
          event.revisionAction === 'VOID' &&
          previous &&
          account?.active &&
          !query.isError &&
          !query.isFetching &&
          !accounts.isError;
        return (
          <Section key={event.eventId}>
            <LedgerEventView event={event} />
            {restorable && previous ? (
              <Action
                label="恢复成交"
                onPress={() =>
                  navigation.navigate('ExecutionEditor', {
                    ...params,
                    event: previous,
                    action: 'restore',
                    supersedesEventId: event.eventId,
                  })
                }
              />
            ) : null}
          </Section>
        );
      })}
    </Page>
  );
}
