import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  clearPortfolioPositions,
  confirmPortfolioInstrument,
  removePortfolioPosition,
  saveAccount,
  saveCashBalance,
  savePosition,
  toggleAccount,
} from './portfolio.api.js';
import { portfolioKeys } from './portfolio.queries.js';
import type { SaveAccountInput, SavePositionInput } from './portfolio.api.js';
import type { Account } from './portfolio.types.js';

const invalidatePortfolio = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: portfolioKeys.root });

export const useSaveAccountMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, accountId }: { input: SaveAccountInput; accountId?: string }) =>
      saveAccount(input, accountId),
    onSuccess: () => invalidatePortfolio(client),
  });
};

export const useToggleAccountMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, active }: { accountId: string; active: boolean }) =>
      toggleAccount(accountId, active),
    onSuccess: () => invalidatePortfolio(client),
  });
};

export const useConfirmPortfolioInstrumentMutation = () =>
  useMutation({ mutationFn: (instrumentId: string) => confirmPortfolioInstrument(instrumentId) });

export const useSavePositionMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, positionId }: { input: SavePositionInput; positionId?: string }) =>
      savePosition(input, positionId),
    onSuccess: () => invalidatePortfolio(client),
  });
};

export const useSaveCashBalanceMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      amount,
      currency,
      capturedAt,
    }: {
      accountId: string;
      amount: string;
      currency?: Account['currency'];
      capturedAt?: string;
    }) => saveCashBalance(accountId, amount, currency, capturedAt),
    onSuccess: () => invalidatePortfolio(client),
  });
};

export const useClearPortfolioPositionsMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => clearPortfolioPositions(accountId),
    onSuccess: () => invalidatePortfolio(client),
  });
};

export const useRemovePortfolioPositionMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (positionId: string) => removePortfolioPosition(positionId),
    onSuccess: () => invalidatePortfolio(client),
  });
};
