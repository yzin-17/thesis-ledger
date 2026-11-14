import { useToastManager } from '@/components/ui/toast';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { fetchStrategies } from '../strategy/strategy.api.js';
import { strategyKeys } from '../strategy/strategy.queries.js';
import type { StrategyRecord } from '../strategy/strategy.types.js';
import { useCreateAiRunMutation } from './ai.mutations.js';
import { useAiCapabilitiesQuery, useAiResearchRetryPrefillQuery } from './ai.queries.js';
import type { AiResearchScope, AiRunResult, StartResearchInput } from './ai.types.js';
import {
  newResearchCanSubmit,
  newResearchCapabilitySummary,
  newResearchEntityError,
} from './new-research-readiness.js';
import { researchContextForScope, useResearchAccountScope } from './research-account-scope.js';
import { useResearchDefaultModel } from './use-research-default-model.js';

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : '研究暂时无法启动，请稍后重试。';

const questionErrorFor = (value: string) => {
  const length = value.trim().length;
  if (length === 0) return '请先描述需要回答的问题。';
  if (length > 2000) return '研究问题不能超过 2000 个字符。';
  return null;
};

function useNewResearchSheet({
  open,
  onOpenChange,
  initialQuestion = '',
  retryOfRunId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: string | undefined;
  retryOfRunId?: string | undefined;
  onCreated: (run: AiRunResult) => void;
}) {
  const [scope, setScope] = useState<AiResearchScope>('portfolio');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [strategyVersionId, setStrategyVersionId] = useState<string | null>(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [templateId, setTemplateId] = useState<StartResearchInput['templateId']>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [retryContextReselected, setRetryContextReselected] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [unknownRiskConfirmed, setUnknownRiskConfirmed] = useState(false);
  const mutation = useCreateAiRunMutation();
  const capabilitiesQuery = useAiCapabilitiesQuery(open);
  const researchModel = useResearchDefaultModel(open);
  const routingSettingsQuery = researchModel.query;
  const retryPrefillQuery = useAiResearchRetryPrefillQuery(retryOfRunId, open);
  const toastManager = useToastManager<object>();

  useEffect(() => {
    if (!open) return;
    setQuestion(initialQuestion);
    setScope('portfolio');
    setAccountId(null);
    setSymbol(null);
    setStrategyVersionId(null);
    setTemplateId(undefined);
    setSubmitError(null);
    setHasAttemptedSubmit(false);
    setRetryContextReselected(false);
    setRetryConfirmed(false);
    setUnknownRiskConfirmed(false);
  }, [open, initialQuestion]);

  useEffect(() => {
    const prefill = retryPrefillQuery.data;
    if (!open || !prefill || prefill.sourceRunId !== retryOfRunId) return;
    setQuestion(prefill.question);
    setScope(prefill.context.scope);
    setAccountId(prefill.context.accountId ?? null);
    setSymbol(prefill.context.symbol ?? null);
    setStrategyVersionId(prefill.context.strategyVersionId ?? null);
    setTemplateId(prefill.templateId ?? undefined);
  }, [open, retryOfRunId, retryPrefillQuery.data]);

  const {
    mode,
    accountsQuery,
    positionsQuery,
    positions,
    accountOptions,
    effectiveAccountId,
    retryModeMismatch,
  } = useResearchAccountScope({
    open,
    scope,
    accountId,
    ...(retryPrefillQuery.data ? { retryContext: retryPrefillQuery.data.context } : {}),
  });
  const strategiesQuery = useQuery({
    queryKey: strategyKeys.strategies(),
    queryFn: () => fetchStrategies(),
    enabled: open && scope === 'strategy',
    staleTime: 15_000,
  });

  const strategies: StrategyRecord[] = strategiesQuery.data ?? [];
  const strategyVersions = useMemo(
    () =>
      strategies.flatMap((strategy) => strategy.versions.map((version) => ({ strategy, version }))),
    [strategies],
  );
  const selectedStrategy = strategyVersions.find((item) => item.version.id === strategyVersionId);
  const positionOptions = positions.map((position) => ({
    value: position.symbol,
    label: `${position.symbol} · ${position.asset.name}`,
  }));
  const strategyOptions = strategyVersions.map(({ strategy, version }) => ({
    value: version.id,
    label: `${strategy.name} · v${version.version}`,
  }));
  const questionError = questionErrorFor(question);
  const entityError = newResearchEntityError({
    scope,
    accountId,
    symbol,
    strategyVersionId,
    retryPrefillQuery,
    retryContextReselected,
  });
  const visibleQuestionError = hasAttemptedSubmit ? questionError : null;
  const visibleEntityError = hasAttemptedSubmit ? entityError : null;
  const canSubmit = newResearchCanSubmit({
    retryModeMismatch,
    scope,
    effectiveAccountId,
    accountsQuery,
    questionError,
    entityError,
    mutation,
    retryOfRunId,
    retryPrefillQuery,
    retryConfirmed,
    unknownRiskConfirmed,
    capabilitiesQuery,
  });
  const canSubmitWithDefault = canSubmit && researchModel.ready;

  const { boundary, capabilityMessage } = newResearchCapabilitySummary(scope, capabilitiesQuery);
  const { handleScopeChange, submit } = newResearchActions({
    setScope,
    setAccountId,
    setSymbol,
    setStrategyVersionId,
    setSubmitError,
    setHasAttemptedSubmit,
    retryOfRunId,
    setRetryContextReselected,
    canSubmitWithDefault,
    scope,
    effectiveAccountId,
    symbol,
    strategyVersionId,
    mode,
    retryPrefillQuery,
    retryContextReselected,
    mutation,
    question,
    routingSettingsQuery,
    templateId,
    unknownRiskConfirmed,
    onCreated,
    onOpenChange,
    toastManager,
  });

  const requestClose = useDraftCloseGuard({
    open,
    draft: {
      mode,
      scope,
      accountId,
      symbol,
      strategyVersionId,
      question,
      templateId,
      retryOfRunId,
      retryConfirmed,
      retryContextReselected,
      unknownRiskConfirmed,
      modelKey: researchModel.selectedKey,
    },
    dirty:
      researchModel.dirty ||
      question !== initialQuestion ||
      scope !== 'portfolio' ||
      Boolean(
        accountId ||
        symbol ||
        strategyVersionId ||
        templateId ||
        retryConfirmed ||
        unknownRiskConfirmed,
      ),
    busy: mutation.isPending || researchModel.saving,
    onOpenChange,
  });

  const submitLabel = newResearchSubmitLabel(retryOfRunId, mutation.isPending);

  return {
    open,
    requestClose,
    retryOfRunId,
    researchModel,
    mutation,
    scope,
    handleScopeChange,
    visibleEntityError,
    accountOptions,
    effectiveAccountId,
    setAccountId,
    setRetryContextReselected,
    accountsQuery,
    accountId,
    setSymbol,
    positionOptions,
    symbol,
    positionsQuery,
    positions,
    strategyOptions,
    strategyVersionId,
    setStrategyVersionId,
    strategiesQuery,
    strategyVersions,
    selectedStrategy,
    visibleQuestionError,
    question,
    setQuestion,
    templateId,
    setTemplateId,
    mode,
    retryModeMismatch,
    boundary,
    capabilityMessage,
    retryPrefillQuery,
    retryConfirmed,
    setRetryConfirmed,
    unknownRiskConfirmed,
    setUnknownRiskConfirmed,
    submitError,
    submit,
    canSubmitWithDefault,
    submitLabel,
  };
}

export { useNewResearchSheet };

type NewResearchActionsInput = {
  setScope: (value: AiResearchScope) => void;
  setAccountId: (value: string | null) => void;
  setSymbol: (value: string | null) => void;
  setStrategyVersionId: (value: string | null) => void;
  setSubmitError: (value: string | null) => void;
  setHasAttemptedSubmit: (value: boolean) => void;
  retryOfRunId: string | undefined;
  setRetryContextReselected: (value: boolean) => void;
  canSubmitWithDefault: boolean;
  scope: AiResearchScope;
  effectiveAccountId: string | null;
  symbol: string | null;
  strategyVersionId: string | null;
  mode: 'actual' | 'shadow';
  retryPrefillQuery: ReturnType<typeof useAiResearchRetryPrefillQuery>;
  retryContextReselected: boolean;
  mutation: ReturnType<typeof useCreateAiRunMutation>;
  question: string;
  routingSettingsQuery: ReturnType<typeof useResearchDefaultModel>['query'];
  templateId: StartResearchInput['templateId'];
  unknownRiskConfirmed: boolean;
  onCreated: (run: AiRunResult) => void;
  onOpenChange: (open: boolean) => void;
  toastManager: ReturnType<typeof useToastManager>;
};
function newResearchActions({
  setScope,
  setAccountId,
  setSymbol,
  setStrategyVersionId,
  setSubmitError,
  setHasAttemptedSubmit,
  retryOfRunId,
  setRetryContextReselected,
  canSubmitWithDefault,
  scope,
  effectiveAccountId,
  symbol,
  strategyVersionId,
  mode,
  retryPrefillQuery,
  retryContextReselected,
  mutation,
  question,
  routingSettingsQuery,
  templateId,
  unknownRiskConfirmed,
  onCreated,
  onOpenChange,
  toastManager,
}: NewResearchActionsInput) {
  const handleScopeChange = (next: string[]) => {
    const nextScope = next[0] as AiResearchScope | undefined;
    if (!nextScope) return;
    setScope(nextScope);
    setAccountId(null);
    setSymbol(null);
    setStrategyVersionId(null);
    setSubmitError(null);
    setHasAttemptedSubmit(false);
    if (retryOfRunId) setRetryContextReselected(true);
  };
  const submit = async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmitWithDefault) return;
    let context = researchContextForScope({
      scope,
      accountId: effectiveAccountId,
      symbol,
      strategyVersionId,
      mode,
    });
    if (retryPrefillQuery.data && !retryContextReselected) {
      context = retryPrefillQuery.data.context;
    }
    setSubmitError(null);
    try {
      const run = await mutation.mutateAsync({
        question: question.trim(),
        context,
        ...(routingSettingsQuery.data?.revision === undefined
          ? {}
          : { researchSettingsRevision: routingSettingsQuery.data.revision }),
        ...(templateId ? { templateId } : {}),
        ...(retryOfRunId
          ? {
              retryOfRunId,
              retryConfirmation: {
                contextConfirmed: true as const,
                acknowledgeUnknownOutcomeRisk: unknownRiskConfirmed,
              },
            }
          : {}),
      });
      onCreated(run);
      onOpenChange(false);
      toastManager.add({
        title: '研究已开始',
        description: '任务已进入列表，状态会自动更新。',
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };
  return { handleScopeChange, submit };
}

function newResearchSubmitLabel(retryOfRunId: string | undefined, pending: boolean) {
  let submitLabel = retryOfRunId ? '确认并再次生成' : '开始研究';
  if (pending) submitLabel = '开始中…';

return submitLabel;
}
