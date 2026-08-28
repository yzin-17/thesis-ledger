import { useQuery } from '@tanstack/react-query';
import { fetchReviewCandidates, type ReviewCandidatesQuery } from './journal.api.js';

export const journalKeys = {
  root: ['desktop', 'journal'] as const,
  candidates: (params: ReviewCandidatesQuery) =>
    [
      ...journalKeys.root,
      'review-candidates',
      params.accountId,
      params.mode ?? 'actual',
      params.symbol ?? '',
      params.start ?? '',
      params.end ?? '',
      params.cursor ?? '',
      params.limit ?? 20,
    ] as const,
};

export const useReviewCandidatesQuery = (params: ReviewCandidatesQuery, enabled: boolean) =>
  useQuery({
    queryKey: journalKeys.candidates(params),
    queryFn: () => fetchReviewCandidates(params),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
