import { useMutation } from '@tanstack/react-query';
import { reviewBehavior, reviewSingleTrade } from './journal.api.js';
import type { ReviewTrade } from './journal.types.js';

export const useSingleTradeReviewMutation = () =>
  useMutation({ mutationFn: (trade: ReviewTrade) => reviewSingleTrade(trade) });

export const useBehaviorReviewMutation = () =>
  useMutation({ mutationFn: (trades: ReviewTrade[]) => reviewBehavior(trades) });
