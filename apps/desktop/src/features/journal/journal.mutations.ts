import { useMutation } from '@tanstack/react-query';
import {
  analyzeBehavior,
  analyzeSingleTrade,
  explainBehavior,
  explainSingleTrade,
  reviewBehavior,
  reviewSingleTrade,
} from './journal.api.js';
import type {
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  ReviewTrade,
  ReviewWindow,
} from './journal.types.js';

export const useSingleTradeReviewMutation = () =>
  useMutation({ mutationFn: (trade: ReviewTrade) => reviewSingleTrade(trade) });

export const useBehaviorReviewMutation = () =>
  useMutation({ mutationFn: (trades: ReviewTrade[]) => reviewBehavior(trades) });

export const useSingleTradeAnalysisMutation = () =>
  useMutation({ mutationFn: (trade: ReviewTrade) => analyzeSingleTrade(trade) });

export const useBehaviorAnalysisMutation = () =>
  useMutation({
    mutationFn: ({ trades, window }: { trades: ReviewTrade[]; window?: ReviewWindow }) =>
      analyzeBehavior(trades, window),
  });

export const useSingleTradeExplanationMutation = () =>
  useMutation({
    mutationFn: ({
      trade,
      result,
      sources,
    }: {
      trade: ReviewTrade;
      result: DeterministicJournalReviewResult;
      sources?: JournalReviewCandidate['sources'];
    }) => explainSingleTrade(trade, result, undefined, sources),
  });

export const useBehaviorExplanationMutation = () =>
  useMutation({
    mutationFn: ({
      trades,
      result,
      window,
      sources,
    }: {
      trades: ReviewTrade[];
      result: { metrics: unknown; window: unknown };
      window: ReviewWindow;
      sources?: JournalReviewCandidate['sources'][];
    }) => explainBehavior(trades, result, window, undefined, sources),
  });
