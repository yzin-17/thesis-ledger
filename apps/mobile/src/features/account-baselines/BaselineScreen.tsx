import { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useRoute, type RouteProp } from '@react-navigation/native';
import {
  type CreateBaselineObservationBatchCommand,
  type InstrumentSearchResult,
} from '@thesis-ledger/schemas';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import {
  useAccounts,
  useLedger,
  useMobileCommand,
  useValuation,
} from '../../app/query/mobile-queries';
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
import { BaselinePositions } from './BaselinePositions';
import { InstrumentPicker } from '../market/InstrumentPicker';
import { baselineFingerprint, buildBaselineCommand, type BaselineForm } from './baseline-command';

export function BaselineScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Baseline'>>();
  const { api } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const valuation = useValuation(params.accountId);
  const [instrument, setInstrument] = useState<InstrumentSearchResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [costIncludesFees, setCostIncludesFees] = useState<
    'UNKNOWN' | 'INCLUDES_FEES' | 'EXCLUDES_FEES'
  >('UNKNOWN');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const prepared = useRef<{ key: string; command: CreateBaselineObservationBatchCommand } | null>(
    null,
  );
  const reset = () => {
    setQuantity('');
    setCost('');
    setObservedAt('');
    setCostIncludesFees('UNKNOWN');
    setInstrument(null);
    prepared.current = null;
  };
  useDirtyForm(
    Boolean(instrument || quantity || cost || observedAt || costIncludesFees !== 'UNKNOWN'),
    reset,
  );
  const write = useMobileCommand(async (form: BaselineForm) => {
    const key = baselineFingerprint(form);
    if (prepared.current?.key !== key) {
      const command = await buildBaselineCommand(
        form,
        {
          id: Crypto.randomUUID(),
          accountId: params.accountId,
          capturedAt: new Date().toISOString(),
          sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
      );
      prepared.current = { key, command };
    }
    return api.ledger.createBaselineObservationBatch(prepared.current.command);
  });
  const remove = useMobileCommand((id: string) => api.positionManagement.remove(id));
  const clear = useMobileCommand(() => api.positionManagement.clear(params.accountId));
  const blocked =
    write.isPending ||
    remove.isPending ||
    clear.isPending ||
    !canUseReadForWrite(ledger) ||
    !canUseReadForWrite(accounts) ||
    !account?.active ||
    account.type === 'cash';
  const submit = async () => {
    if (blocked || !account) return;
    try {
      assertWritable(accounts);
      assertWritable(ledger);
      const form = {
        instrument,
        quantity,
        cost,
        observedAt,
        costIncludesFees,
        currency: account.currency,
      };
      const result = await write.mutateAsync(form);
      reset();
      setFeedbackError(false);
      setFeedback(result.refreshFailed ? '持仓已写入账本，数据尚未刷新。' : '持仓已写入账本。');
    } catch (error) {
      setFeedbackError(true);
      setFeedback(failureMessage(error));
    }
  };
  const destructive = async (id?: string) => {
    try {
      assertWritable(accounts);
      assertWritable(ledger);
      if (
        !(await confirmAction(
          id ? '移除该持仓？' : '清空该账户的全部持仓？',
          '会写入账本并将对应持仓数量归零，历史记录保留。',
          true,
        ))
      )
        return;
      const result = id ? await remove.mutateAsync(id) : await clear.mutateAsync(undefined);
      setFeedbackError(false);
      setFeedback(result.refreshFailed ? '操作已完成，数据尚未刷新。' : '持仓已更新。');
    } catch (error) {
      setFeedbackError(true);
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page title="人工录入持仓">
      <QueryStatus query={ledger} retry={() => void ledger.refetch()} />
      <InstrumentPicker onConfirmed={setInstrument} />
      {instrument ? (
        <Copy>
          已确认：{instrument.displayName} · {instrument.symbol}
        </Copy>
      ) : null}
      <Field
        label="数量"
        value={quantity}
        onChange={setQuantity}
        keyboardType="decimal-pad"
        editable={!blocked}
      />
      <Field
        label={`成本均价（${account?.currency ?? '账户币种'}，未知留空）`}
        value={cost}
        onChange={setCost}
        keyboardType="decimal-pad"
        editable={!blocked}
      />
      <Field
        label="实际观察日期或 ISO 时间"
        value={observedAt}
        onChange={setObservedAt}
        editable={!blocked}
      />
      <Choices
        label="成本费用口径"
        value={costIncludesFees}
        options={[
          { value: 'UNKNOWN', label: '未知' },
          { value: 'INCLUDES_FEES', label: '含费用' },
          { value: 'EXCLUDES_FEES', label: '不含费用' },
        ]}
        onChange={setCostIncludesFees}
        disabled={blocked}
      />
      <Copy muted>本次仅更新所选标的；其他持仓与现金保持原样。</Copy>
      <Feedback message={feedback} error={feedbackError} />
      <Action
        label={write.isPending ? '写入中…' : '写入持仓快照'}
        primary
        disabled={blocked || !instrument}
        onPress={() => void submit()}
      />
      <BaselinePositions
        query={valuation}
        blocked={blocked}
        onRetry={() => void valuation.refetch()}
        onRemove={(id) => void destructive(id)}
        onClear={() => void destructive()}
      />
    </Page>
  );
}
