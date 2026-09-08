import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmRecurringFundInvestmentOccurrence,
  CreateRecurringFundInvestmentPlan,
  UpdateRecurringFundInvestmentPlan,
} from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import { accountDataKeys } from './account-data.queries.js';

export const fundInvestmentKeys = {
  root: ['desktop', 'fund-investments'] as const,
  plans: (accountId: string) => [...fundInvestmentKeys.root, 'plans', accountId] as const,
  occurrences: (accountId: string) =>
    [...fundInvestmentKeys.root, 'occurrences', accountId] as const,
};

export const useFundInvestmentQueries = (accountId: string, enabled: boolean) => ({
  plans: useQuery({
    queryKey: fundInvestmentKeys.plans(accountId),
    queryFn: () => getDesktopApiClient().fundInvestments.getPlans({ accountId }),
    enabled,
    retry: false,
  }),
  occurrences: useQuery({
    queryKey: fundInvestmentKeys.occurrences(accountId),
    queryFn: () => getDesktopApiClient().fundInvestments.getOccurrences({ accountId }),
    enabled,
    retry: false,
  }),
});

export const useFundInvestmentMutations = (accountId: string) => {
  const queryClient = useQueryClient();
  const invalidatePlans = () =>
    queryClient.invalidateQueries({ queryKey: fundInvestmentKeys.root });
  const invalidateAccount = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [...accountDataKeys.root, 'events', accountId] }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation('actual', accountId) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation('actual') }),
    ]);

  return {
    createPlan: useMutation({
      mutationFn: (input: CreateRecurringFundInvestmentPlan) =>
        getDesktopApiClient().fundInvestments.createPlan(input),
      onSuccess: invalidatePlans,
    }),
    updatePlan: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateRecurringFundInvestmentPlan }) =>
        getDesktopApiClient().fundInvestments.updatePlan(id, input),
      onSuccess: invalidatePlans,
    }),
    changePlanState: useMutation({
      mutationFn: ({
        id,
        action,
        expectedVersion,
      }: {
        id: string;
        action: 'pause' | 'resume' | 'end';
        expectedVersion: number;
      }) => {
        const client = getDesktopApiClient().fundInvestments;
        if (action === 'pause') return client.pausePlan(id, expectedVersion);
        if (action === 'resume') return client.resumePlan(id, expectedVersion);
        return client.endPlan(id, expectedVersion);
      },
      onSuccess: invalidatePlans,
    }),
    confirmOccurrence: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: ConfirmRecurringFundInvestmentOccurrence;
      }) => getDesktopApiClient().fundInvestments.confirmOccurrence(id, input),
      onSuccess: async () => {
        await invalidatePlans();
        await invalidateAccount();
      },
    }),
    skipOccurrence: useMutation({
      mutationFn: ({
        id,
        expectedVersion,
        reason,
      }: {
        id: string;
        expectedVersion: number;
        reason: string;
      }) => getDesktopApiClient().fundInvestments.skipOccurrence(id, { expectedVersion, reason }),
      onSuccess: invalidatePlans,
    }),
    reopenOccurrence: useMutation({
      mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
        getDesktopApiClient().fundInvestments.reopenOccurrence(id, expectedVersion),
      onSuccess: invalidatePlans,
    }),
  };
};
