import type { BehaviorReviewResult, JournalReviewResult, ReviewTrade } from './journal.types.js';

type AsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

type Dependencies = {
  singleReviewMutation: AsyncMutation<ReviewTrade, JournalReviewResult>;
  behaviorReviewMutation: AsyncMutation<ReviewTrade[], BehaviorReviewResult>;
  setSingleReview: (result: JournalReviewResult) => void;
  setBehaviorReview: (result: BehaviorReviewResult) => void;
};

export const createJournalReviewActions = ({
  singleReviewMutation,
  behaviorReviewMutation,
  setSingleReview,
  setBehaviorReview,
}: Dependencies) => ({
  reviewSingleTrade: async (trade: ReviewTrade) => {
    const result = await singleReviewMutation.mutateAsync(trade);
    setSingleReview(result);
    return result;
  },
  reviewBehavior: async (trades: ReviewTrade[]) => {
    const result = await behaviorReviewMutation.mutateAsync(trades);
    setBehaviorReview(result);
    return result;
  },
});
