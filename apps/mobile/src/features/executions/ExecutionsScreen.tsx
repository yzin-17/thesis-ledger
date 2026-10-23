import { useRef, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import { voidExecutionCommandSchema, type LedgerEvent } from '@thesis-ledger/schemas';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useLedger, useMobileCommand } from '../../app/query/mobile-queries';
import { assertWritable } from '../../app/query/query-state';
import {
  Action,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { isExecution } from './execution-command';
import { LedgerEventView } from './LedgerEventView';
export function ExecutionsScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Executions'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === params.accountId);
  const query = useLedger(account?.id ?? null);
  const [target, setTarget] = useState<{ event: LedgerEvent; revision: string } | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{ key: string; id: string } | null>(null);
  useDirtyForm(Boolean(target && reason), () => {
    setTarget(null);
    setReason('');
  });
  const mutation = useMobileCommand(
    (command: ReturnType<typeof voidExecutionCommandSchema.parse>) =>
      api.ledger.voidExecution(command),
  );
  const blocked =
    !account?.active ||
    accounts.isError ||
    accounts.isFetching ||
    query.isError ||
    query.isFetching ||
    mutation.isPending;
  const submit = async () => {
    if (!target || blocked) return;
    try {
      assertWritable(accounts);
      assertWritable(query);
      if (!(await confirmAction('作废这笔成交？', '历史事实会保留，并追加作废记录。', true)))
        return;
      const key = JSON.stringify({
        eventId: target.event.eventId,
        revision: target.revision,
        reason,
      });
      if (prepared.current?.key !== key) prepared.current = { key, id: Crypto.randomUUID() };
      const command = voidExecutionCommandSchema.parse({
        command: 'VOID_EXECUTION',
        accountId: params.accountId,
        expectedLedgerRevision: target.revision,
        supersedesEventId: target.event.eventId,
        source: {
          category: 'MANUAL',
          channel: 'mobile-account-data',
          externalId: prepared.current.id,
        },
        actorId: 'mobile-user',
        reason: reason.trim(),
      });
      const result = await mutation.mutateAsync(command);
      setTarget(null);
      setReason('');
      setFeedback(result.refreshFailed ? '成交已作废，列表尚未刷新。' : '成交已作废。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page
      title="成交记录"
      action={
        <Action
          label="新增成交"
          disabled={blocked}
          onPress={() => navigation.navigate('ExecutionEditor', params)}
        />
      }
    >
      <QueryStatus
        query={query}
        empty={query.data?.events.filter(isExecution).length === 0}
        retry={() => void query.refetch()}
      />
      <Feedback message={feedback} error={mutation.isError} />
      {query.data?.events.filter(isExecution).map((event) => (
        <Section key={event.eventId}>
          <LedgerEventView event={event} />
          <Action
            label="更正成交"
            disabled={blocked}
            onPress={() =>
              navigation.navigate('ExecutionEditor', { ...params, event, action: 'replace' })
            }
          />
          <Action
            label="作废成交"
            disabled={blocked}
            destructive
            onPress={() => {
              setTarget({ event, revision: query.data.ledgerRevision });
              setReason('');
            }}
          />
        </Section>
      ))}
      {target ? (
        <Section title="作废原因">
          <Field
            label="作废原因"
            value={reason}
            onChange={setReason}
            editable={!mutation.isPending}
          />
          <Action
            label="确认作废成交"
            disabled={blocked || !reason.trim()}
            destructive
            onPress={() => void submit()}
          />
          <Action
            label="取消作废"
            onPress={() => {
              setTarget(null);
              setReason('');
            }}
          />
        </Section>
      ) : null}
    </Page>
  );
}
