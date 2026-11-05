import { useEffect, useState } from 'react';
import {
  requireAuthoringModel,
  prepareAuthoringOperation,
  findOrSubmitAuthoringOperation,
  authoringOperationRejected,
  applyAuthoringOperation,
  applyAuthoringProposal,
  authoringSubmissionEnabled,
  authoringResultControls,
} from './authoring-operation-command';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import {
  authoringSubmitIntentSchema,
  type AuthoringSubmitIntent,
  type AuthoringModificationTarget,
} from '@thesis-ledger/schemas';
import { useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
const operationStatusLabels: Record<string, string> = {
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  queued: '排队中',
  running: '运行中',
};
function useAuthoringOperationsController({
  id,
  revision,
  disabled,
  generationReady,
  modificationReady,
  reload,
  onBusyChange,
}: {
  id: string;
  revision: number;
  disabled: boolean;
  generationReady: boolean;
  modificationReady: boolean;
  reload: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const authoring = api.strategy.authoring;
  const [modelKey, setModelKey] = useState('');
  const [kind, setKind] = useState<'analyze' | 'generate' | 'modify'>('analyze');
  const [intent, setIntent] = useState('');
  const [target, setTarget] = useState<AuthoringModificationTarget>('entry');
  const [ack, setAck] = useState('no');
  const [operationId, setOperationId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const storageKey = JSON.stringify(['mobile-authoring-operation-v1', baseUrl, id]);
  const models = useQuery({
    queryKey: [...scope, 'authoring-models'],
    queryFn: ({ signal }) => authoring.models(signal),
    retry: false,
  });
  const selected = models.data?.find((v) => v.key === modelKey);
  const conditionsReady =
    kind === 'analyze' ||
    (kind === 'generate' && generationReady) ||
    (kind === 'modify' && modificationReady);
  const pending = useQuery({
    queryKey: [...scope, 'authoring-operation-pending', id],
    queryFn: async (): Promise<AuthoringSubmitIntent | null> => {
      const raw = await AsyncStorage.getItem(storageKey);
      return raw ? authoringSubmitIntentSchema.parse(JSON.parse(raw)) : null;
    },
    retry: false,
  });
  const history = useQuery({
    queryKey: [...scope, 'authoring-history', id],
    queryFn: ({ signal }) => authoring.history(id, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((v) => ['queued', 'running'].includes(v.status)) ? 2000 : false,
  });
  const operation = useQuery({
    queryKey: [...scope, 'authoring-operation', operationId],
    enabled: !!operationId,
    queryFn: ({ signal }) => authoring.operation(operationId, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false,
  });
  const proposal = useQuery({
    queryKey: [...scope, 'authoring-proposal', proposalId],
    enabled: !!proposalId,
    queryFn: ({ signal }) => authoring.proposal(proposalId, signal),
    retry: false,
  });
  const command = useMobileCommand(
    async (action: string) => {
      if (action === 'rebuild') {
        if (!rejected) throw Error('原操作尚未确认被拒绝，凭据仍保留。');
        await AsyncStorage.removeItem(storageKey);
        await pending.refetch();
        setAck('no');
        setRejected(false);
        return;
      }
      if (action === 'submit' || action === 'recover') {
        let body = pending.data;
        if (!body) {
          if (action === 'recover') throw Error('没有待确认操作。');
          const model = requireAuthoringModel({
            disabled,
            conditionsReady,
            modelsReady: models.isSuccess,
            selected,
            kind,
            acknowledged: ack === 'yes',
          });
          body = await prepareAuthoringOperation(authoring, {
            id,
            revision,
            kind,
            model,
            intent,
            target,
            key: randomUUID(),
          });
          if (
            !(await confirmAction(
              '提交模型操作？',
              `${model.providerId} / ${model.model}；${model.pricingLabel}。本次会消费模型额度。`,
            ))
          )
            return;
          await AsyncStorage.setItem(storageKey, JSON.stringify(body));
          await pending.refetch();
        }
        try {
          setOperationId(
            await findOrSubmitAuthoringOperation(authoring, id, body, action === 'recover'),
          );
        } catch (error) {
          setRejected(authoringOperationRejected(error));
          throw error;
        }
        await AsyncStorage.removeItem(storageKey);
        await pending.refetch();
        await history.refetch();
        setRejected(false);
        setMessage('原操作已确认，请查看状态与输出。');
        return;
      }
      if (action === 'proposal-apply' || action === 'proposal-discard') {
        const applied = await applyAuthoringProposal(
          authoring,
          {
            proposal: proposal.data,
            readFailed: proposal.isError,
            disabled,
            revision,
            action: action === 'proposal-apply' ? 'apply' : 'discard',
          },
          confirmAction,
        );
        if (!applied) return;
        await reload();
        await proposal.refetch();
      } else {
        const receipt = await applyAuthoringOperation(
          authoring,
          { operation: operation.data, readFailed: operation.isError, disabled, revision, action },
          confirmAction,
        );
        if (!receipt) return;
        if (action === 'proposal') setProposalId(receipt.id);
        if (action.startsWith('apply')) await reload();
        await operation.refetch();
      }
      await history.refetch();
      setMessage('服务端已处理，当前状态已重新读取。');
    },
    { refresh: false },
  );
  useEffect(() => {
    onBusyChange(command.isPending);
    return () => onBusyChange(false);
  }, [command.isPending, onBusyChange]);
  const execute = (action: string) =>
    void command.mutateAsync(action).catch((e) => setMessage(failureMessage(e)));
  const busy = disabled || command.isPending;
  const canSubmit = authoringSubmissionEnabled({
    busy,
    pendingKnown: pending.isSuccess,
    pending: !!pending.data,
    conditionsReady,
    modelsReady: models.isSuccess,
    selected,
    kind,
    acknowledged: ack === 'yes',
  });
  const controls = authoringResultControls({
    operation: operation.data,
    proposal: proposal.data,
    busy,
    operationError: operation.isError,
    proposalError: proposal.isError,
    revision,
  });
  return {
    models,
    pending,
    kind,
    setKind,
    setAck,
    busy,
    modelKey,
    setModelKey,
    selected,
    ack,
    intent,
    setIntent,
    target,
    setTarget,
    conditionsReady,
    execute,
    command,
    rejected,
    history,
    setOperationId,
    setProposalId,
    operationId,
    operation,
    controls,
    canSubmit,
    proposalId,
    proposal,
    message,
  };
}
export function AuthoringOperations({
  id,
  revision,
  disabled,
  generationReady,
  modificationReady,
  reload,
  onBusyChange,
}: {
  id: string;
  revision: number;
  disabled: boolean;
  generationReady: boolean;
  modificationReady: boolean;
  reload: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const state = useAuthoringOperationsController({
    id,
    revision,
    disabled,
    generationReady,
    modificationReady,
    reload,
    onBusyChange,
  });
  const {
    models,
    pending,


    conditionsReady,
    execute,
    command,
    rejected,
    history,
    setOperationId,
    setProposalId,
    operationId,
    operation,
    controls,
    canSubmit,
    proposalId,
    proposal,
    message,
  } = state;
  return (
    <Section title="模型操作与建议">
      <QueryStatus query={models} retry={() => void models.refetch()} />
      <QueryStatus query={pending} retry={() => void pending.refetch()} />
      <AuthoringModelFields state={state} />
      <Action
        label={pending.data ? '原样重试模型操作' : '确认提交模型操作'}
        disabled={!canSubmit}
        onPress={() => execute('submit')}
      />
      {!conditionsReady ? (
        <Copy>请先完成需求澄清、问题确认和交易约束；局部修改还需要有效定义。</Copy>
      ) : null}
      {pending.data ? (
        <>
          <Copy>待确认标识 {pending.data.idempotencyKey}；原输入已留在本机。</Copy>
          <Action
            label="读取历史找回原操作"
            disabled={command.isPending}
            onPress={() => execute('recover')}
          />
        </>
      ) : null}
      {rejected ? (
        <Action
          label="重新确认被拒绝的模型操作"
          disabled={command.isPending}
          onPress={() => execute('rebuild')}
        />
      ) : null}
      <QueryStatus query={history} retry={() => void history.refetch()} />
      {history.data?.map((row) => (
        <Action
          key={row.id}
          label={`读取操作 ${row.id} · ${operationStatusLabels[row.status] ?? '待核对'}`}
          onPress={() => {
            setOperationId(row.id);
            setProposalId(row.proposalId ?? '');
          }}
        />
      ))}
      {operationId ? (
        <QueryStatus query={operation} retry={() => void operation.refetch()} />
      ) : null}
      {operation.data ? (
        <>
          <Copy>
            操作 {operationId} · 修订 {operation.data.revision}
          </Copy>
          <Copy>{JSON.stringify(operation.data.outcome, null, 2)}</Copy>
          <Action
            label="取消当前模型操作"
            disabled={!controls.cancel}
            onPress={() => execute('cancel')}
          />
          <Action
            label="采用需求分析"
            disabled={!controls.analysis}
            onPress={() => execute('apply-analysis')}
          />
          <Action
            label="采用生成定义"
            disabled={!controls.generation}
            onPress={() => execute('apply-generation')}
          />
          <Action
            label="准备修改建议"
            disabled={!controls.proposal}
            onPress={() => execute('proposal')}
          />
          <Action
            label="丢弃当前操作结果"
            disabled={!controls.discard}
            onPress={() => execute('discard')}
          />
        </>
      ) : null}
      {proposalId ? <QueryStatus query={proposal} retry={() => void proposal.refetch()} /> : null}
      {proposal.data ? (
        <Section title="修改差异">
          <Copy>{JSON.stringify(proposal.data.payload.differences, null, 2)}</Copy>
          <Action
            label="确认采用修改建议"
            disabled={!controls.proposalApply}
            onPress={() => execute('proposal-apply')}
          />
          <Action
            label="丢弃修改建议"
            disabled={!controls.proposalDiscard}
            onPress={() => execute('proposal-discard')}
          />
        </Section>
      ) : null}
      <Feedback message={message} error={command.isError} />
    </Section>
  );
}

function AuthoringModelFields({
  state,
}: {
  state: ReturnType<typeof useAuthoringOperationsController>;
}) {
  const {
    kind,
    setKind,
    setAck,
    busy,
    pending,
    modelKey,
    setModelKey,
    models,
    selected,
    ack,
    intent,
    setIntent,
    target,
    setTarget,
  } = state;
  return (
    <>
      <Choices
        label="编写用途"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setAck('no');
        }}
        disabled={busy || !!pending.data}
        options={[
          { value: 'analyze', label: '澄清需求' },
          { value: 'generate', label: '生成定义' },
          { value: 'modify', label: '局部修改' },
        ]}
      />
      <Choices
        label="编写模型"
        value={modelKey}
        disabled={busy || !!pending.data}
        onChange={(v) => {
          setModelKey(v);
          setAck('no');
        }}
        options={(models.data ?? []).map((v) => ({
          value: v.key,
          label: `${v.providerId} / ${v.model} · ${v.available[kind] ? '已验证' : '当前用途不可用'}`,
        }))}
      />
      <Copy>{selected?.pricingLabel ?? '请选择模型；模型配置只读。'}</Copy>
      {selected?.costUnknown ? (
        <Choices
          label="未知费用确认"
          value={ack}
          disabled={busy || !!pending.data}
          onChange={setAck}
          options={[
            { value: 'no', label: '尚未确认' },
            { value: 'yes', label: '接受未知费用' },
          ]}
        />
      ) : null}
      {kind === 'modify' ? (
        <>
          <Field
            label="修改意图"
            value={intent}
            editable={!busy && !pending.data}
            onChange={setIntent}
          />
          <Choices
            label="修改范围"
            value={target}
            disabled={busy || !!pending.data}
            onChange={setTarget}
            options={[
              { value: 'entry', label: '入场' },
              { value: 'exit', label: '退出' },
              { value: 'sizing', label: '仓位' },
              { value: 'risk', label: '风险' },
              { value: 'cost', label: '成本' },
            ]}
          />
        </>
      ) : null}
    </>
  );
}
