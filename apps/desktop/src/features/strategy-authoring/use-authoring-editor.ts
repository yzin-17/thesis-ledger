import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authoringStrategySchema,
  type AuthoringContent,
  type AuthoringModificationTarget,
} from '@thesis-ledger/schemas';
import {
  authoringApi,
  fetchAuthoringModels,
  type ProposalView,
  type AuthoringModel,
  type OperationSummary,
} from './authoring.api.js';
import { useAuthoringDraft } from './use-authoring-draft.js';
import { authoringRequestFailure, submitAuthoringIntent } from './authoring-submission.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';

function canGenerate(content: AuthoringContent) {
  return Boolean(
    content.confirmation &&
    content.description.trim() &&
    content.requirements.length &&
    content.questions.every((question) => question.answerState === 'confirmed') &&
    content.requirements.every(
      (requirement) => !['unresolved', 'unsupported'].includes(requirement.state),
    ),
  );
}
export function useAuthoringEditor({
  id,
  ownerId,
  onDirtyChange,
  onSaved,
}: {
  id: string;
  ownerId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (strategyId: string, versionId: string) => void;
}) {
  const draft = useAuthoringDraft(ownerId, id);
  const cache = useQueryClient();
  const [modelKey, setModelKey] = useState('');
  const [costAcknowledged, setCostAcknowledged] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalView>();
  const [intent, setIntent] = useState('');
  const [target, setTarget] = useState<AuthoringModificationTarget>('risk');
  const [review, setReview] = useState<Awaited<ReturnType<typeof authoringApi.review>>>();
  const [reviewed, setReviewed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const submission = useRef<{ body: Record<string, unknown>; key: string } | null>(null);
  const models = useQuery({
    queryKey: ['desktop', 'authoring-models'],
    queryFn: fetchAuthoringModels,
    staleTime: 60_000,
    retry: false,
  });
  const selected = models.data?.find((model) => model.key === modelKey);
  const historyKey = ['desktop', 'authoring-history', ownerId, id];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => authoringApi.history(id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((operation) => ['queued', 'running'].includes(operation.status))
        ? 10_000
        : false,
  });
  const selectedSummary = selectHistoryOperation(history.data, operationId);
  const operation = useQuery({
    queryKey: [
      'desktop',
      'authoring-operation',
      ownerId,
      selectedSummary?.id,
      selectedSummary?.updatedAt,
    ],
    queryFn: () => authoringApi.operation(selectedSummary!.id),
    enabled: Boolean(selectedSummary),
    retry: false,
  });
  const existingProposal = useQuery({
    queryKey: [
      'desktop',
      'authoring-proposal',
      ownerId,
      selectedSummary?.proposalId,
      selectedSummary?.proposalStatus,
    ],
    queryFn: () => authoringApi.proposal(selectedSummary!.proposalId!),
    enabled: Boolean(selectedSummary?.proposalId),
    retry: false,
  });
  const active = history.data?.some((item) => ['queued', 'running'].includes(item.status)) ?? false;
  const perform = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => {
      setFailure(null);
      return action();
    },
    onError: (error) => setFailure(authoringRequestFailure(error)),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: historyKey });
    },
  });
  const busy = perform.isPending || draft.busy;
  useNavigationGuard({ dirty: false, busy });
  const editing = draft.query.data?.state === 'editing';
  useEffect(() => {
    onDirtyChange(draft.dirty || draft.busy || perform.isPending);
  }, [draft.dirty, draft.busy, perform.isPending, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const submit = (kind: 'analyze' | 'generate' | 'modify') =>
    perform.mutate(async () => {
      const current = await draft.flush();
      if (!current || !selected || !selected.available[kind])
        throw new Error('请选择已验证当前用途的模型');
      const key = JSON.stringify({
        revision: current.revision,
        kind,
        modelKey,
        intent: kind === 'modify' ? intent : '',
        target: kind === 'modify' ? target : null,
      });
      if (submission.current && submission.current.key !== key)
        throw new Error('上次提交结果尚未确认，请先读取历史操作，避免重复调用');
      if (!submission.current)
        submission.current = {
          key,
          body: {
            kind,
            expectedRevision: current.revision,
            providerId: selected.providerId,
            model: selected.model,
            idempotencyKey: crypto.randomUUID(),
            intent: kind === 'modify' ? intent : '',
            ...(kind === 'modify' ? { modificationTarget: target } : {}),
            unknownCostAcknowledgedAt:
              selected.costUnknown && costAcknowledged ? new Date().toISOString() : null,
          },
        };
      const result = await submitAuthoringIntent(id, submission.current.body, () => {
        submission.current = null;
      });
      submission.current = null;
      setOperationId(result.id);
      setProposal(undefined);
      setReview(undefined);
      setReviewed(false);
    });
  const applyOperation = (
    action: 'cancel' | 'apply-analysis' | 'apply-generation' | 'proposal' | 'discard',
  ) =>
    perform.mutate(async () => {
      if (!operation.data) return;
      const current = await draft.flush();
      if (action !== 'cancel' && current?.revision !== operation.data.revision)
        throw new Error('输入已修改，操作结果已过期');
      const result = await authoringApi.action(operation.data.id, action, operation.data.revision);
      if (action === 'proposal') setProposal(result as ProposalView);
      if (action === 'apply-analysis' || action === 'apply-generation') await draft.reload();
      setReview(undefined);
      setReviewed(false);
    });
  const applyProposal = (action: 'apply' | 'discard') =>
    perform.mutate(async () => {
      const candidate = proposal ?? existingProposal.data;
      if (!candidate) return;
      const current = await draft.flush();
      if (current?.revision !== candidate.revision) throw new Error('建议已过期');
      await authoringApi.proposalAction(candidate.id, action, candidate.revision);
      setProposal(undefined);
      setReview(undefined);
      setReviewed(false);
      await draft.reload();
    });
  const reviewCurrent = () =>
    perform.mutate(async () => {
      await draft.flush();
      setReview(await authoringApi.review(id));
      setReviewed(false);
    });
  const save = () =>
    perform.mutate(async () => {
      const current = await draft.flush();
      if (!reviewed || !review || !current || review.revision !== current.revision)
        throw new Error('请审核当前修订后再保存');
      const result = await authoringApi.save(id, {
        expectedRevision: review.revision,
        reviewedDefinitionHash: review.definitionHash,
        name: current.content.title,
      });
      await cache.invalidateQueries({ queryKey: ['desktop', 'strategy'] });
      onDirtyChange(false);
      onSaved(result.strategyId, result.versionId);
    });
  const content = draft.content;
  const generationReady = canGenerate(content);
  const paidAllowed = Boolean(selected && (!selected.costUnknown || costAcknowledged));
  const disabled = !editing || busy || active || !paidAllowed;
  const controls = availableActions(content, selected, disabled, generationReady, intent);
  const resetReview = () => {
    setReview(undefined);
    setReviewed(false);
  };
  const readLatest = () =>
    perform.mutate(async () => {
      await draft.useServerContent();
      setProposal(undefined);
      resetReview();
    });
  const discardDraft = () =>
    perform.mutate(async () => {
      const current = await draft.flush();
      if (!current) return;
      await authoringApi.discardDraft(id, current.revision);
      await draft.reload();
    });
  const recoverSubmission = () =>
    perform.mutate(async () => {
      const refreshed = await history.refetch();
      if (refreshed.isError) throw refreshed.error;
      const original = refreshed.data?.find(
        (item) => item.selection.idempotencyKey === submission.current?.body.idempotencyKey,
      );
      if (!original) throw new Error('历史尚未确认原提交，请重试原提交，保留同一请求意图');
      setOperationId(original.id);
      submission.current = null;
    });
  const replaySubmission = () =>
    perform.mutate(async () => {
      if (!submission.current) return;
      const result = await submitAuthoringIntent(id, submission.current.body, () => {
        submission.current = null;
      });
      submission.current = null;
      setOperationId(result.id);
      setProposal(undefined);
      resetReview();
    });
  const selectOperation = (nextId: string) => {
    setOperationId(nextId);
    setProposal(undefined);
  };
  return {
    draft,
    content,
    models,
    selected,
    history,
    operation,
    proposalView: proposal ?? existingProposal.data,
    modelKey,
    setModelKey,
    costAcknowledged,
    setCostAcknowledged,
    intent,
    setIntent,
    target,
    setTarget,
    review,
    reviewed,
    setReviewed,
    failure,
    submissionUnknown: Boolean(submission.current),
    busy,
    active,
    editing,
    generationReady,
    controls,
    perform,
    submit,
    applyOperation,
    applyProposal,
    reviewCurrent,
    save,
    readLatest,
    discardDraft,
    recoverSubmission,
    replaySubmission,
    selectOperation,
  };
}
export type AuthoringEditorModel = ReturnType<typeof useAuthoringEditor>;

function selectHistoryOperation(
  history: OperationSummary[] | undefined,
  selectedId: string | null,
) {
  return history?.find((operation) => operation.id === selectedId) ?? history?.[0];
}
function availableActions(
  content: AuthoringContent,
  selected: AuthoringModel | undefined,
  disabled: boolean,
  generationReady: boolean,
  intent: string,
) {
  return {
    analyze:
      !disabled && Boolean(selected?.available.analyze) && Boolean(content.description.trim()),
    generate: !disabled && Boolean(selected?.available.generate) && generationReady,
    modify:
      !disabled &&
      Boolean(selected?.available.modify) &&
      generationReady &&
      Boolean(intent.trim()) &&
      authoringStrategySchema.safeParse(content.definitionText).success,
  };
}
