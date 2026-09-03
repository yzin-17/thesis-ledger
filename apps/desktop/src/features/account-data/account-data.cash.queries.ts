import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateRecurringCashDepositPlan } from '@thesis-ledger/api-client';

import { accountDataKeys } from './account-data.queries.js';
import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import type { PortfolioMode } from '../portfolio/portfolio.types.js';
import {
  changeCashDepositPlanState,
  confirmCashDepositOccurrence,
  createManualCashDeposit,
  createCashDepositPlan,
  createManualCashTransfer,
  fetchCashDepositOccurrences,
  fetchCashDepositPlans,
  reopenCashDepositOccurrence,
  restoreManualCashTransfer,
  replaceManualCashTransfer,
  skipCashDepositOccurrence,
  updateCashDepositPlan,
  voidManualCashTransfer,
} from './account-data.cash.api.js';

export const cashDepositKeys = {
  root: ['desktop', 'cash-deposits'] as const,
  plans: (accountId: string) => [...cashDepositKeys.root, 'plans', accountId] as const,
  occurrences: (accountId: string) => [...cashDepositKeys.root, 'occurrences', accountId] as const,
};

export const useCashDepositQueries = (accountId: string, enabled: boolean) => ({
  plans: useQuery({
    queryKey: cashDepositKeys.plans(accountId),
    queryFn: () => fetchCashDepositPlans(accountId),
    enabled,
    retry: false,
  }),
  occurrences: useQuery({
    queryKey: cashDepositKeys.occurrences(accountId),
    queryFn: () => fetchCashDepositOccurrences(accountId),
    enabled,
    retry: false,
  }),
});

export const useCashOperationsMutations = (accountId: string, mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  const invalidateCashDeposits = () =>
    queryClient.invalidateQueries({ queryKey: cashDepositKeys.root });
  const invalidateCashAccount = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...accountDataKeys.root, 'events', accountId],
      }),
      queryClient.invalidateQueries({ queryKey: accountDataKeys.audit(accountId, mode) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(mode, accountId) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(mode) }),
    ]);
  const invalidateTransfer = async (sourceAccountId: string, targetAccountId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...accountDataKeys.root, 'events', sourceAccountId],
      }),
      queryClient.invalidateQueries({
        queryKey: [...accountDataKeys.root, 'events', targetAccountId],
      }),
      queryClient.invalidateQueries({ queryKey: accountDataKeys.audit(sourceAccountId, mode) }),
      queryClient.invalidateQueries({ queryKey: accountDataKeys.audit(targetAccountId, mode) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(mode, sourceAccountId) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(mode, targetAccountId) }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.valuation(mode) }),
    ]);
  };

  return {
    deposit: useMutation({
      mutationFn: (input: Parameters<typeof createManualCashDeposit>[0]) =>
        createManualCashDeposit(input),
      onSuccess: invalidateCashAccount,
    }),
    transfer: useMutation({
      mutationFn: (input: Parameters<typeof createManualCashTransfer>[0]) =>
        createManualCashTransfer(input),
      onSuccess: (_result, variables) =>
        invalidateTransfer(variables.sourceAccountId, variables.targetAccountId),
    }),
    replaceTransfer: useMutation({
      mutationFn: (input: Parameters<typeof replaceManualCashTransfer>[0]) =>
        replaceManualCashTransfer(input),
      onSuccess: (_result, variables) =>
        invalidateTransfer(
          variables.event.accountId,
          variables.event.payload.transfer?.counterpartyAccountId ?? variables.event.accountId,
        ),
    }),
    voidTransfer: useMutation({
      mutationFn: (input: Parameters<typeof voidManualCashTransfer>[0]) =>
        voidManualCashTransfer(input),
      onSuccess: (_result, variables) =>
        invalidateTransfer(
          variables.event.accountId,
          variables.event.payload.transfer?.counterpartyAccountId ?? variables.event.accountId,
        ),
    }),
    restoreTransfer: useMutation({
      mutationFn: (input: Parameters<typeof restoreManualCashTransfer>[0]) =>
        restoreManualCashTransfer(input),
      onSuccess: (_result, variables) =>
        invalidateTransfer(
          variables.event.accountId,
          variables.event.payload.transfer?.counterpartyAccountId ?? variables.event.accountId,
        ),
    }),
    createPlan: useMutation({
      mutationFn: (input: Parameters<typeof createCashDepositPlan>[0]) =>
        createCashDepositPlan(input),
      onSuccess: invalidateCashDeposits,
    }),
    updatePlan: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateRecurringCashDepositPlan }) =>
        updateCashDepositPlan(id, input),
      onSuccess: invalidateCashDeposits,
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
      }) => changeCashDepositPlanState(id, action, expectedVersion),
      onSuccess: invalidateCashDeposits,
    }),
    confirmOccurrence: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: Parameters<typeof confirmCashDepositOccurrence>[1];
      }) => confirmCashDepositOccurrence(id, input),
      onSuccess: async () => {
        await invalidateCashDeposits();
        await invalidateCashAccount();
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
      }) => skipCashDepositOccurrence(id, { expectedVersion, reason }),
      onSuccess: invalidateCashDeposits,
    }),
    reopenOccurrence: useMutation({
      mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
        reopenCashDepositOccurrence(id, expectedVersion),
      onSuccess: invalidateCashDeposits,
    }),
  };
};
