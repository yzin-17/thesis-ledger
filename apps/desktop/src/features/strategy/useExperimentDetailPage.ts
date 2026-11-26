import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { createClientRequestId } from '../../lib/client-request-id';
import {
  canRevealTestMetrics,
  findStrategyVersion,
  latestExperimentAdoption,
  metricRecord,
} from './strategy-experiment-detail.model.js';
import {
  adoptOptimizationCandidate,
  cancelOptimizationExperiment,
  cloneOptimizationExperiment,
  completeOptimizationExperiment,
  fetchOptimizationAdoptionContext,
  fetchOptimizationCompare,
  fetchOptimizationExperiment,
  type OptimizationCandidate,
} from './strategy-optimization.api.js';
import { strategyKeys } from './strategy.queries.js';
import type { StrategyRecord } from './strategy.types.js';
import { useExperimentOperationFeedback } from './useExperimentOperationFeedback.js';
const optimizationKey = ['desktop', 'strategy', 'optimization'] as const;

const settledStatuses = new Set(['succeeded', 'failed', 'cancelled']);

const nonPollingStatuses = new Set(['succeeded', 'failed', 'cancelled']);

function useStrategyExperimentDetailPage({ strategies }: { strategies: StrategyRecord[] }) {
  const inputs = useExperimentDetailInputs(strategies);
  const {
    experimentId,
    queryClient,
    notifySuccess,
    reviewCandidate,
    setReviewCandidate,
    setWriteReceipt,
    setClonedExperimentId,
    clearOperationError,
    reportOperationError,
    adoptedVersion,
    setAdoptedVersion,
    detailQuery,
    compareQuery,
    experiment,
    candidates,
    compare,
    invalidate,
    isCurrent,
  } = inputs;
  const finalizeMutation = useMutation({
    onMutate: () => clearOperationError('finalize'),
    mutationFn: () => {
      if (!experimentId) throw new Error('实验不存在');
      return completeOptimizationExperiment(experimentId);
    },
    onSuccess: async () => {
      if (isCurrent()) {
        setWriteReceipt('封存测试请求已确认');
        notifySuccess({
          title: '封存测试请求已确认',
          description: '完成与结果揭示以重新读取的服务端状态为准。',
        });
      }
      await invalidate();
    },
    onError: (error) => reportOperationError('finalize', '封存测试未完成', error),
  });
  const cancelMutation = useMutation({
    onMutate: () => clearOperationError('cancel'),
    mutationFn: () => cancelOptimizationExperiment(experimentId ?? ''),
    onSuccess: async () => {
      if (isCurrent()) {
        setWriteReceipt('实验已确认取消');
        notifySuccess({ title: '实验已取消' });
      }
      await invalidate();
    },
    onError: (error) => reportOperationError('cancel', '取消失败', error),
  });
  const cloneMutation = useMutation({
    onMutate: () => clearOperationError('clone'),
    mutationFn: () => cloneOptimizationExperiment(experimentId ?? ''),
    onSuccess: async (created) => {
      if (isCurrent()) {
        setWriteReceipt('实验已确认克隆');
        setClonedExperimentId(created.id);
        queryClient.setQueryData<Awaited<ReturnType<typeof fetchOptimizationExperiment>>>(
          [...optimizationKey, 'experiment', created.id],
          (existing) => existing ?? { experiment: created, candidates: [], attempts: [] },
        );
        notifySuccess({ title: '实验已克隆' });
      }
      await invalidate();
    },
    onError: (error) => reportOperationError('clone', '克隆失败', error),
  });
  const adoptionContextQuery = useQuery({
    queryKey: [...optimizationKey, 'adoption-context', experimentId, reviewCandidate?.id],
    queryFn: () => fetchOptimizationAdoptionContext(experimentId ?? '', reviewCandidate?.id ?? ''),
    enabled: Boolean(experimentId && reviewCandidate),
  });
  const adoptionIntent = useRef<{
    experimentId: string;
    body: Parameters<typeof adoptOptimizationCandidate>[1];
  } | null>(null);
  const adoptMutation = useMutation({
    onMutate: () => clearOperationError('adopt'),
    mutationFn: () => {
      const context = adoptionContextQuery.data;
      if (!experimentId || !reviewCandidate || !context) throw new Error('采纳上下文尚未就绪');
      if (
        adoptionIntent.current?.experimentId !== experimentId ||
        adoptionIntent.current.body.candidateId !== reviewCandidate.id
      ) {
        adoptionIntent.current = {
          experimentId,
          body: {
            candidateId: reviewCandidate.id,
            candidateHash: reviewCandidate.executionHash,
            expectedStrategyVersion: context.expectedStrategyVersion,
            idempotencyKey: createClientRequestId(),
            acknowledgeTestExposure: reviewCandidate.id !== experiment?.selectedCandidateId,
          },
        };
      }
      return adoptOptimizationCandidate(experimentId, adoptionIntent.current.body);
    },
    onSuccess: async (result) => {
      if (!isCurrent()) {
        await invalidate();
        return;
      }
      adoptionIntent.current = null;
      setWriteReceipt(`已采纳为正式策略 v${result.strategyVersion.version}`);
      setAdoptedVersion({
        id: result.strategyVersion.id,
        strategyId: result.strategyVersion.strategyId,
        version: result.strategyVersion.version,
      });
      setReviewCandidate(null);
      notifySuccess({
        title: `已采纳为正式策略 v${result.strategyVersion.version}`,
        description:
          result.detailsStatus === 'unavailable'
            ? '正式版本已保存，风险规则预览暂不可用。已有风险应用保持当前状态。'
            : '已有风险应用不会自动更新或启用。',
      });
      await invalidate();
    },
    onError: async (error) => {
      await invalidate();
      if (!isCurrent()) return;
      const refreshed = queryClient.getQueryData<
        Awaited<ReturnType<typeof fetchOptimizationExperiment>>
      >([...optimizationKey, 'experiment', experimentId]);
      const committed = refreshed?.candidates.find((item) => item.id === reviewCandidate?.id);
      if (
        committed?.adoptedStrategyVersionId &&
        committed.executionHash === adoptionIntent.current?.body.candidateHash
      ) {
        adoptionIntent.current = null;
        setWriteReceipt('候选已采纳，正式版本已保存');
        setReviewCandidate(null);
        notifySuccess({
          title: '已确认采纳',
          description: '正式版本已保存。已有风险应用不会自动更新或启用。',
        });
        return;
      }
      const title =
        error instanceof ThesisLedgerApiError &&
        error.payload?.error === 'ADOPTION_OUTCOME_UNCONFIRMED'
          ? '采纳结果待确认'
          : '采纳失败';
      if (title !== '采纳结果待确认') adoptionIntent.current = null;
      reportOperationError('adopt', title, error);
    },
  });

  const {
    retryRequired,
    readFailed,
    writesDisabled,
    testRevealed,
    active,
    baselineValidation,
    baselineTest,
    finalizedCandidate,
    displayedAdoptedVersion,
  } = experimentDetailMaterials({
    experiment,
    detailQuery,
    compareQuery,
    finalizeMutation,
    cancelMutation,
    cloneMutation,
    adoptMutation,
    compare,
    candidates,
    strategies,
    adoptedVersion,
  });

  return {
    ...inputs,
    readFailed,
    writesDisabled,
    cloneMutation,
    active,
    cancelMutation,
    retryRequired,
    displayedAdoptedVersion,
    testRevealed,
    finalizeMutation,
    baselineValidation,
    strategies,
    baselineTest,
    adoptionContextQuery,
    adoptMutation,
    finalizedCandidate,
  };
}

function experimentDetailMaterials({
  experiment,
  detailQuery,
  compareQuery,
  finalizeMutation,
  cancelMutation,
  cloneMutation,
  adoptMutation,
  compare,
  candidates,
  strategies,
  adoptedVersion,
}: {
  experiment: Awaited<ReturnType<typeof fetchOptimizationExperiment>>['experiment'] | undefined;
  detailQuery: { isError: boolean };
  compareQuery: { isError: boolean };
  finalizeMutation: { isPending: boolean };
  cancelMutation: { isPending: boolean };
  cloneMutation: { isPending: boolean };
  adoptMutation: { isPending: boolean };
  compare: Awaited<ReturnType<typeof fetchOptimizationCompare>> | undefined;
  candidates: OptimizationCandidate[];
  strategies: StrategyRecord[];
  adoptedVersion: { id: string; strategyId: string; version: number } | null;
}) {
  const retryRequired = experiment?.stopReason?.startsWith('final_test_retry_required:') ?? false;
  const readFailed = detailQuery.isError || compareQuery.isError;
  const writeBusy =
    finalizeMutation.isPending ||
    cancelMutation.isPending ||
    cloneMutation.isPending ||
    adoptMutation.isPending;
  const writesDisabled = readFailed || writeBusy;
  const testRevealed = experiment ? canRevealTestMetrics(experiment) : false;
  const active = Boolean(experiment && !settledStatuses.has(experiment.status));
  const baselineValidation = metricRecord(compare?.baseline.metrics.validation);
  const baselineTest = metricRecord(compare?.baseline.metrics.test);
  const finalizedCandidate = candidates.find(
    (candidate) => candidate.id === experiment?.selectedCandidateId,
  );
  const displayedAdoptedVersion = latestExperimentAdoption(candidates, strategies, adoptedVersion);
  return {
    retryRequired,
    readFailed,
    writeBusy,
    writesDisabled,
    testRevealed,
    active,
    baselineValidation,
    baselineTest,
    finalizedCandidate,
    displayedAdoptedVersion,
  };
}

function useExperimentDetailInputs(strategies: StrategyRecord[]) {
  const { experimentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const feedback = useExperimentOperationFeedback();
  const view = searchParams.get('view') === 'runtime' ? 'runtime' : 'candidates';
  const [reviewCandidate, setReviewCandidate] = useState<OptimizationCandidate | null>(null);
  const adoptionTrigger = useRef<HTMLButtonElement | null>(null);
  const [writeReceipt, setWriteReceipt] = useState<string | null>(null);
  const [clonedExperimentId, setClonedExperimentId] = useState<string | null>(null);
  const [adoptedVersion, setAdoptedVersion] = useState<{
    id: string;
    strategyId: string;
    version: number;
  } | null>(null);
  const detailQuery = useQuery({
    queryKey: [...optimizationKey, 'experiment', experimentId],
    queryFn: () => fetchOptimizationExperiment(experimentId ?? ''),
    enabled: Boolean(experimentId),
    refetchInterval: (query) => {
      const status = query.state.data?.experiment.status;
      return status && !nonPollingStatuses.has(status) ? 3_000 : false;
    },
  });
  const compareQuery = useQuery({
    queryKey: [...optimizationKey, 'compare', experimentId],
    queryFn: () => fetchOptimizationCompare(experimentId ?? ''),
    enabled: Boolean(experimentId),
    refetchInterval:
      detailQuery.data && !nonPollingStatuses.has(detailQuery.data.experiment.status)
        ? 3_000
        : false,
  });
  const experiment = detailQuery.data?.experiment;
  const candidates = detailQuery.data?.candidates ?? [];
  const attempts = detailQuery.data?.attempts ?? [];
  const compare = compareQuery.data;
  const baseline = experiment
    ? findStrategyVersion(strategies, experiment.baselineStrategyVersionId)
    : null;
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: optimizationKey }),
      queryClient.invalidateQueries({ queryKey: strategyKeys.strategies() }),
    ]);
  };
  return {
    experimentId,
    searchParams,
    setSearchParams,
    queryClient,
    ...feedback,
    view,
    reviewCandidate,
    setReviewCandidate,
    adoptionTrigger,
    writeReceipt,
    setWriteReceipt,
    clonedExperimentId,
    setClonedExperimentId,
    adoptedVersion,
    setAdoptedVersion,
    detailQuery,
    compareQuery,
    experiment,
    candidates,
    attempts,
    compare,
    baseline,
    invalidate,
  };
}
export { useStrategyExperimentDetailPage };
