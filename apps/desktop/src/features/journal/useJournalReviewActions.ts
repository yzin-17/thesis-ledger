import type { Dispatch, SetStateAction } from 'react';
import { parseTrade, parseTrades } from './journal-review-input.js';

import { useToastManager } from '@/components/ui/toast';

import {
  useBehaviorAnalysisMutation,
  useBehaviorExplanationMutation,
  useSaveReviewSnapshotMutation,
  useSingleTradeAnalysisMutation,
  useSingleTradeExplanationMutation,
} from './journal.mutations.js';

import type {
  BehaviorReviewResult,
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  JournalReviewResult,
  ReviewEvidenceDraft,
  ReviewTrade,
  ReviewWindow,
} from './journal.types.js';

type Setter<T> = Dispatch<SetStateAction<T>>;
type ActionState = {
  selectedCandidate: JournalReviewCandidate | null;
  currentSingleTrade: ReviewTrade | null;
  periodTrades: ReviewTrade[];
  periodWindowInvalid: boolean;
  periodWindow: ReviewWindow;
  advancedMode: 'single' | 'period';
  setSingleAiRun: Setter<JournalReviewResult['aiRun']>;
  setSingleResult: Setter<DeterministicJournalReviewResult | null>;
  setPeriodAiRun: Setter<BehaviorReviewResult['aiRun']>;
  setPeriodResult: Setter<Omit<BehaviorReviewResult, 'aiRun'> | null>;
  setSelectedCandidate: Setter<JournalReviewCandidate | null>;
  setManualTrade: Setter<ReviewTrade | null>;
  setEvidenceDraft: Setter<ReviewEvidenceDraft>;
  setManualOpen: Setter<boolean>;
  setPeriodTradesOverride: Setter<ReviewTrade[] | null>;
};

export function useJournalReviewActions({
  selectedCandidate,
  currentSingleTrade,
  periodTrades,
  periodWindowInvalid,
  periodWindow,
  advancedMode,
  setSingleAiRun,
  setSingleResult,
  setPeriodAiRun,
  setPeriodResult,
  setSelectedCandidate,
  setManualTrade,
  setEvidenceDraft,
  setManualOpen,
  setPeriodTradesOverride,
}: ActionState) {
  const toastManager = useToastManager();

  const singleAnalysis = useSingleTradeAnalysisMutation();

  const periodAnalysis = useBehaviorAnalysisMutation();

  const singleExplanation = useSingleTradeExplanationMutation();

  const periodExplanation = useBehaviorExplanationMutation();

  const reviewSnapshotMutation = useSaveReviewSnapshotMutation();

  const persistReviewSnapshot = async (trade: ReviewTrade, outputSnapshot: unknown) => {
    if (!selectedCandidate) return;
    try {
      await reviewSnapshotMutation.mutateAsync({
        accountId: selectedCandidate.accountId,
        mode: selectedCandidate.accountMode,
        reviewObjectType: selectedCandidate.reviewObjectType,
        tradeId: selectedCandidate.tradeId,
        ...(selectedCandidate.closeSliceId ? { closeSliceId: selectedCandidate.closeSliceId } : {}),
        inputSnapshot: trade,
        outputSnapshot,
      });
    } catch {
      toastManager.add({
        title: '复盘快照保存失败',
        description: '确定性结果仍然保留，但本次结果未写入长期复盘快照。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const startSingleReview = async () => {
    if (!currentSingleTrade) return;
    setSingleAiRun(null);
    try {
      const result = await singleAnalysis.mutateAsync(currentSingleTrade);
      setSingleResult(result);
      await persistReviewSnapshot(currentSingleTrade, result);
      toastManager.add({
        title: '单笔复盘完成',
        description: '确定性事实已计算；AI 解读需要单独触发。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '确定性复盘失败',
        description: '请检查服务状态后重试；已保留当前交易证据。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const startPeriodReview = async () => {
    if (periodTrades.length === 0 || periodWindowInvalid) return;
    setPeriodAiRun(null);
    try {
      const result = await periodAnalysis.mutateAsync({
        trades: periodTrades,
        window: periodWindow,
      });
      setPeriodResult(result);
      toastManager.add({
        title: '周期复盘完成',
        description: `已按明确窗口计算 ${periodTrades.length} 笔交易。`,
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '周期复盘失败',
        description: '请检查服务状态后重试；窗口和样本仍保留。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const applyAdvancedJson = (value: unknown) => {
    if (advancedMode === 'single') {
      const parsed = parseTrade(value);
      if (!parsed) {
        toastManager.add({
          title: 'JSON Schema 校验失败',
          description: '单笔对象必须包含 symbol、entryAt、exitAt 和数字 pnl。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
        return;
      }
      setSelectedCandidate(null);
      setManualTrade(parsed);
      setEvidenceDraft({});
      setSingleResult(null);
      setSingleAiRun(null);
      setManualOpen(false);
      return;
    }
    const parsed = parseTrades(value);
    if (!parsed) {
      toastManager.add({
        title: 'JSON Schema 校验失败',
        description: '周期输入必须是包含有效交易对象的非空数组。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    setPeriodTradesOverride(parsed);
    setPeriodResult(null);
    setPeriodAiRun(null);
  };
  return {
    singleAnalysis,
    periodAnalysis,
    singleExplanation,
    periodExplanation,
    persistReviewSnapshot,
    startSingleReview,
    startPeriodReview,
    applyAdvancedJson,
  };
}
