import { useEffect, useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import type { AccountStackParams } from '../../app/navigation-types';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import { useAccounts, useLedger, useMobileCommand } from '../../app/query/mobile-queries';
import { assertWritable, canUseReadForWrite } from '../../app/query/query-state';
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
import { InstrumentPicker } from '../market/InstrumentPicker';
import { buildExecutionCommand, executionForm, type ExecutionForm } from './execution-command';
import { ExecutionCharges } from './ExecutionCharges';
export function ExecutionEditor() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'ExecutionEditor'>>();
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const initial = useRef(executionForm(params.event, account?.currency ?? 'CNY')).current;
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [confirmed, setConfirmed] = useState(Boolean(params.event));
  const [revision, setRevision] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{
    key: string;
    command: ReturnType<typeof buildExecutionCommand>;
  } | null>(null);
  useEffect(() => {
    if (!revision && ledger.data) setRevision(ledger.data.ledgerRevision);
  }, [revision, ledger.data]);
  useDirtyForm(JSON.stringify(form) !== JSON.stringify(saved), () => setForm(saved));
  const mutation = useMobileCommand(async (command: ReturnType<typeof buildExecutionCommand>) => {
    if (command.command === 'REPLACE_EXECUTION') return api.ledger.replaceExecution(command);
    if (command.command === 'RESTORE_EXECUTION') return api.ledger.restoreExecution(command);
    return api.ledger.createExecution(command);
  });
  const blocked =
    mutation.isPending ||
    !account?.active ||
    account.type === 'cash' ||
    !canUseReadForWrite(accounts) ||
    !canUseReadForWrite(ledger) ||
    !revision;
  const change = (patch: Partial<ExecutionForm>) => setForm((value) => ({ ...value, ...patch }));
  const refresh = async () => {
    if (
      !(await confirmAction('重新读取账本版本？', '输入将保留。请核对服务端最新成交后再提交更正。'))
    )
      return;
    const result = await ledger.refetch();
    if (!result.isError && result.data) setRevision(result.data.ledgerRevision);
  };
  const submit = async () => {
    if (blocked) return;
    try {
      assertWritable(accounts);
      assertWritable(ledger);
      if (!confirmed) throw new Error('请先确认目录标的。');
      const key = JSON.stringify({ form, revision, action: params.action });
      const supersedesEventId = params.supersedesEventId ?? params.event?.eventId;
      if (prepared.current?.key !== key)
        prepared.current = {
          key,
          command: buildExecutionCommand(form, {
            id: Crypto.randomUUID(),
            accountId: params.accountId,
            revision,
            ...(params.action ? { action: params.action } : {}),
            ...(supersedesEventId ? { supersedesEventId } : {}),
          }),
        };
      const result = await mutation.mutateAsync(prepared.current.command);
      setSaved(form);
      setFeedback(
        result.refreshFailed
          ? '成交命令已成功，数据尚未刷新，请勿重复提交。'
          : '成交命令已写入账本。',
      );
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  let title = '新增成交';
  if (params.action === 'replace') title = '更正成交';
  if (params.action === 'restore') title = '恢复成交';
  return (
    <Page
      title={title}
      action={
        <Action label="重新读取" onPress={() => void refresh()} disabled={mutation.isPending} />
      }
    >
      <QueryStatus query={ledger} retry={() => void refresh()} />
      {!params.event ? (
        <InstrumentPicker
          onConfirmed={(item) => {
            change({ symbol: item.symbol });
            setConfirmed(true);
          }}
        />
      ) : (
        <Copy>{form.symbol}</Copy>
      )}
      <Choices
        label="成交方向"
        value={form.side}
        options={[
          { value: 'BUY', label: '买入' },
          { value: 'SELL', label: '卖出' },
        ]}
        onChange={(side) => change({ side })}
        disabled={blocked}
      />
      <Field
        label="成交数量"
        value={form.quantity}
        onChange={(quantity) => change({ quantity })}
        keyboardType="decimal-pad"
        editable={!blocked}
      />
      <Field
        label={`成交价格（${form.currency}）`}
        value={form.price}
        onChange={(price) => change({ price })}
        keyboardType="decimal-pad"
        editable={!blocked}
      />
      <Choices
        label="成交币种"
        value={form.currency}
        options={[
          { value: 'CNY', label: '人民币' },
          { value: 'HKD', label: '港币' },
          { value: 'USD', label: '美元' },
        ]}
        onChange={(currency) => change({ currency })}
        disabled={blocked}
      />
      <Choices
        label="时间精度"
        value={form.timePrecision}
        options={[
          { value: 'DATE', label: '仅日期' },
          { value: 'INSTANT', label: '精确时间' },
        ]}
        onChange={(timePrecision) => change({ timePrecision })}
        disabled={blocked}
      />
      <Field
        label="成交日期或 ISO 时间"
        value={form.occurredAt}
        onChange={(occurredAt) => change({ occurredAt })}
        editable={!blocked}
      />
      <Field
        label="来源时区"
        value={form.sourceTimezone}
        onChange={(sourceTimezone) => change({ sourceTimezone })}
        editable={!blocked}
      />
      <Field
        label="结算时间（可选 ISO 时间）"
        value={form.settledAt}
        onChange={(settledAt) => change({ settledAt })}
        editable={!blocked}
      />
      <Field
        label="预计结算时间（可选 ISO 时间）"
        value={form.expectedAt}
        onChange={(expectedAt) => change({ expectedAt })}
        editable={!blocked}
      />
      <Choices
        label="交易规则核验"
        value={form.capabilityVerification}
        options={[
          { value: 'UNVERIFIED', label: '尚未核验' },
          { value: 'VERIFIED', label: '已人工核验' },
        ]}
        onChange={(capabilityVerification) => change({ capabilityVerification })}
        disabled={blocked}
      />
      <ExecutionCharges
        charges={form.charges}
        currency={form.currency}
        onChange={(charges) => change({ charges })}
        disabled={blocked}
      />
      <Field
        label="备注（可选）"
        value={form.note}
        onChange={(note) => change({ note })}
        editable={!blocked}
      />
      {params.action ? (
        <Field
          label="更正或恢复原因"
          value={form.reason}
          onChange={(reason) => change({ reason })}
          editable={!blocked}
        />
      ) : null}
      <Feedback message={feedback} error={mutation.isError} />
      <Action
        label={mutation.isPending ? '写入中…' : '确认写入账本'}
        primary
        disabled={blocked || !confirmed || JSON.stringify(form) === JSON.stringify(saved)}
        onPress={() => void submit()}
      />
    </Page>
  );
}
