import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmRecurringFundInvestmentOccurrence,
  CreateRecurringFundInvestmentPlan,
  UpdateRecurringFundInvestmentPlan,
} from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { invalidatePortfolioChange } from './portfolio-change.js';

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
    invalidatePortfolioChange(queryClient, {
      mode: 'actual',
      accountIds: [accountId],
      events: true,
      audit: true,
      reconciliation: true,
    });

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
