import { useEffect, useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import * as Crypto from 'expo-crypto';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useMobileCommand } from '../../app/query/mobile-queries';
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
  buildTransferCommand,
  cashTransferPair,
  transferAccounts,
  type TransferForm,
  type TransferRead,
} from './transfer-command';

export function TransferEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'TransferEditor'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const linked = params.event ? transferAccounts(params.event) : null;
  const sourceId = linked?.sourceAccountId ?? params.accountId;
  const [targetId, setTargetId] = useState(linked?.targetAccountId ?? '');
  const source = accounts.data?.find((row) => row.id === sourceId);
  const target = accounts.data?.find((row) => row.id === targetId);
  const query = useQuery({
    queryKey: [...scope, 'transfer-context', sourceId, targetId],
    enabled: Boolean(source && target),
    queryFn: async (): Promise<TransferRead> => {
      const [from, to, fromAudit, toAudit] = await Promise.all([
        api.ledger.getEvents(sourceId),
        api.ledger.getEvents(targetId),
        api.ledger.getEventAudit(sourceId),
        api.ledger.getEventAudit(targetId),
      ]);
      return {
        source: from,
        target: to,
        sourceAudit: fromAudit.events,
        targetAudit: toAudit.events,
      };
    },
  });
  const initial: TransferForm = {
    amount: params.event?.payload.amount ?? '',
    occurredAt: params.event?.occurredAt ?? '',
    note: params.event?.payload.note ?? '',
    reason: '',
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [read, setRead] = useState<TransferRead | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const prepared = useRef<{ key: string; command: ReturnType<typeof buildTransferCommand> } | null>(
    null,
  );
  useEffect(() => {
    if (!read && query.data) setRead(query.data);
  }, [read, query.data]);
  useDirtyForm(JSON.stringify(form) !== JSON.stringify(saved), () => setForm(saved));
  const mutation = useMobileCommand((command: ReturnType<typeof buildTransferCommand>) => {
    if (command.command === 'REPLACE_CASH_TRANSFER') return api.ledger.replaceCashTransfer(command);
    if (command.command === 'VOID_CASH_TRANSFER') return api.ledger.voidCashTransfer(command);
    if (command.command === 'RESTORE_CASH_TRANSFER') return api.ledger.restoreCashTransfer(command);
    return api.ledger.createCashTransfer(command);
  });
  const blocked =
    conflict ||
    mutation.isPending ||
    !source?.active ||
    !target?.active ||
    source.mode !== 'actual' ||
    target.mode !== 'actual' ||
    !cashTransferPair(source.type, target.type) ||
    !read ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(query);
  const change = (patch: Partial<TransferForm>) => setForm((value) => ({ ...value, ...patch }));
  const refresh = async () => {
    if (
      !(await confirmAction('重新读取两侧账本？', '输入将保留，请核对新版本及两端状态后重新确认。'))
    )
      return;
    const result = await query.refetch();
    if (result.data && !result.isError) {
      setRead(result.data);
      prepared.current = null;
      setConflict(false);
    }
  };
  const submit = async () => {
    if (blocked || !source || !target || !read) return;
    try {
      const key = JSON.stringify({ form, sourceId, targetId, read, action: params.action });
      if (prepared.current?.key !== key)
        prepared.current = {
          key,
          command: buildTransferCommand(form, {
            id: Crypto.randomUUID(),
            source,
            target,
            read,
            ...(params.event ? { event: params.event } : {}),
            ...(params.action ? { action: params.action } : {}),
          }),
        };
      if (
        !(await confirmAction(
          '确认划转命令？',
          `${source.name} → ${target.name}，${form.amount} ${source.currency}。两侧账本将原子更新。`,
          params.action === 'void',
        ))
      )
        return;
      const result = await mutation.mutateAsync(prepared.current.command);
      setSaved(form);
      setFeedback(
        result.refreshFailed
          ? '两侧命令已成功，数据尚未刷新，请勿重复提交。'
          : '两侧划转账本已更新。',
      );
    } catch (error) {
      if (error instanceof ThesisLedgerApiError && error.status === 409) setConflict(true);
      setFeedback(failureMessage(error));
    }
  };
  const titles = { replace: '更正划转', void: '作废划转', restore: '恢复划转' };
  return (
    <Page title={params.action ? titles[params.action] : '账户间划转'}>
      <Copy>转出：{source?.name ?? '账户不在当前范围'}</Copy>
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <Choices
        label="转入账户"
        value={targetId}
        options={(accounts.data ?? [])
          .filter(
            (row) =>
              row.id !== sourceId &&
              row.active &&
              row.mode === 'actual' &&
              row.currency === source?.currency &&
              cashTransferPair(source?.type, row.type),
          )
          .map((row) => ({ value: row.id, label: row.name }))}
        onChange={(id) => {
          setTargetId(id);
          setRead(null);
        }}
        disabled={mutation.isPending || Boolean(params.action)}
      />
      {target ? (
        <QueryStatus query={query} retry={() => void query.refetch()} />
      ) : (
        <Copy muted>请选择币种相同的启用实际账户，仅支持现金账户与证券或基金账户之间划转。</Copy>
      )}
      <Copy muted>
        转出修订 {read?.source.ledgerRevision ?? '—'} · 转入修订{' '}
        {read?.target.ledgerRevision ?? '—'}
      </Copy>
      <Field
        label="划转金额"
        value={form.amount}
        onChange={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        editable={!mutation.isPending && params.action !== 'void'}
      />
      <Field
        label="划转 ISO 时间"
        value={form.occurredAt}
        onChange={(occurredAt) => change({ occurredAt })}
        editable={!mutation.isPending && params.action !== 'void'}
      />
      <Field
        label="划转备注（可选）"
        value={form.note}
        onChange={(note) => change({ note })}
        editable={!mutation.isPending && params.action !== 'void'}
      />
      {params.action ? (
        <Field
          label="划转更正原因"
          value={form.reason}
          onChange={(reason) => change({ reason })}
          editable={!mutation.isPending}
        />
      ) : null}
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label="重新读取两侧账本"
        disabled={!target || mutation.isPending}
        onPress={() => void refresh()}
      />
      <Action
        label="确认划转命令"
        primary
        disabled={blocked || JSON.stringify(form) === JSON.stringify(saved)}
        onPress={() => void submit()}
      />
    </Page>
  );
}
