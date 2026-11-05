import { useRef, useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import {
  confirmBaselineReconciliationCommandSchema,
  type BaselineReconciliationCandidate,
} from '@thesis-ledger/schemas';
import type { AccountStackParams } from '../../app/navigation-types';
import { confirmAction, useDirtyForm, useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts, useLedger, useMobileCommand } from '../../app/query/mobile-queries';
import { assertWritable } from '../../app/query/query-state';
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
import { reconciliationConflictLabel } from './reconciliation-labels';
export function ReconciliationScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Reconciliation'>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === params.accountId);
  const ledger = useLedger(account?.id ?? null);
  const candidates = useQuery({
    queryKey: [...scope, 'reconciliation', params.accountId],
    enabled: Boolean(account),
    queryFn: async () => {
      const result = await api.ledger.getReconciliationCandidates(params.accountId);
      if (result.accountId !== params.accountId) throw new Error('对账账户与当前范围不一致。');
      return result;
    },
  });
  const [selected, setSelected] = useState<{
    candidate: BaselineReconciliationCandidate;
    revision: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const prepared = useRef<{ key: string; id: string } | null>(null);
  useDirtyForm(Boolean(selected || reason), () => {
    setSelected(null);
    setReason('');
  });
  const mutation = useMobileCommand(
    (command: ReturnType<typeof confirmBaselineReconciliationCommandSchema.parse>) =>
      api.ledger.confirmBaselineReconciliation(command),
  );
  const blocked =
    mutation.isPending ||
    !account?.active ||
    accounts.isError ||
    accounts.isFetching ||
    ledger.isError ||
    ledger.isFetching ||
    candidates.isError ||
    candidates.isFetching ||
    !ledger.data;
  const refresh = async () => {
    if (
      selected &&
      !(await confirmAction('重新读取对账候选？', '会清除当前选择，原因输入会保留。'))
    )
      return;
    setSelected(null);
    const [events, latest] = await Promise.all([ledger.refetch(), candidates.refetch()]);
    if (!events.isError && !latest.isError) setFeedback(null);
  };
  const submit = async () => {
    if (!selected || blocked) return;
    try {
      assertWritable(accounts);
      assertWritable(ledger);
      assertWritable(candidates);
      const live = candidates.data?.candidates.find(
        (candidate) => candidate.candidateId === selected.candidate.candidateId,
      );
      if (
        !live ||
        live.status !== 'AVAILABLE' ||
        JSON.stringify(live) !== JSON.stringify(selected.candidate)
      )
        throw new Error('候选已变化，请重新读取并核对。');
      if (!(await confirmAction('确认这次对账？', '将写入明确的对账依据，不会自动选择其他候选。')))
        return;
      const key = JSON.stringify({ selected, reason });
      if (prepared.current?.key !== key) prepared.current = { key, id: Crypto.randomUUID() };
      const command = confirmBaselineReconciliationCommandSchema.parse({
        command: 'CONFIRM_BASELINE_RECONCILIATION',
        accountId: params.accountId,
        baselineFactId: live.baselineFactId,
        executionFactIds: live.executionFactIds,
        coveredQuantity: live.coveredQuantity,
        coveredCost: live.coveredCost,
        ruleVersion: candidates.data!.ruleVersion,
        expectedLedgerRevision: selected.revision,
        source: {
          category: 'MANUAL',
          channel: 'mobile-account-data-reconciliation',
          externalId: prepared.current.id,
        },
        actorId: 'mobile-user',
        reason: reason.trim(),
      });
      const result = await mutation.mutateAsync(command);
      setSelected(null);
      setReason('');
      setFeedback(result.refreshFailed ? '对账已确认，数据尚未刷新。' : '对账已确认。');
    } catch (error) {
      setFeedback(failureMessage(error));
    }
  };
  return (
    <Page
      title="确定性对账"
      action={
        <Action label="重新读取" disabled={mutation.isPending} onPress={() => void refresh()} />
      }
    >
      <Copy muted>查看与选择均不会写入账本。只有填写原因并明确确认后才提交。</Copy>
      <QueryStatus
        query={candidates}
        empty={candidates.data?.candidates.length === 0}
        retry={() => void refresh()}
      />
      {candidates.data?.candidates.map((candidate) => (
        <Section key={candidate.candidateId} title={candidate.symbol}>
          <Copy muted>
            观察时间{' '}
            {candidates.data?.checkpoints.find(
              (row) => row.baselineFactId === candidate.baselineFactId,
            )?.occurredAt ?? '未确认'}
          </Copy>
          <Copy>
            观察数量 {candidate.observedQuantity} · 覆盖数量 {candidate.coveredQuantity} · 剩余数量{' '}
            {candidate.remainingQuantity}
          </Copy>
          <Copy>
            覆盖成本 {candidate.coveredCost} · 剩余成本 {candidate.remainingCost ?? '未知'}
          </Copy>
          <Copy muted>
            {candidate.status === 'AVAILABLE' ? '候选可用' : '存在冲突'} ·{' '}
            {candidate.executionFactIds.length} 笔成交
          </Copy>
          {candidate.conflictReasons.length ? (
            <Feedback
              message={candidate.conflictReasons.map(reconciliationConflictLabel).join('；')}
              error
            />
          ) : null}
          <Action
            label={
              selected?.candidate.candidateId === candidate.candidateId
                ? '已选择该候选'
                : '选择该候选'
            }
            disabled={blocked || candidate.status !== 'AVAILABLE'}
            onPress={() => setSelected({ candidate, revision: ledger.data!.ledgerRevision })}
          />
        </Section>
      ))}
      {selected ? (
        <Section title="确认对账">
          <Field
            label="对账原因"
            value={reason}
            onChange={setReason}
            editable={!mutation.isPending}
          />
          <Action
            label="确认对账"
            primary
            disabled={blocked || !reason.trim()}
            onPress={() => void submit()}
          />
          <Action label="取消选择" onPress={() => setSelected(null)} />
        </Section>
      ) : null}
      <Feedback message={feedback} error={mutation.isError} />
    </Page>
  );
}
