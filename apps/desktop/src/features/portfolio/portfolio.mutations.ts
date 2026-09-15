import { useMutation } from '@tanstack/react-query';
import {
  clearPortfolioPositions,
  confirmPortfolioInstrument,
  permanentlyDeleteAccount,
  removePortfolioPosition,
  saveAccount,
  saveCashBalance,
  savePosition,
  toggleAccount,
} from './portfolio.api.js';
import type { SaveAccountInput, SavePositionInput } from './portfolio.api.js';
import type { Account } from './portfolio.types.js';

export const useSaveAccountMutation = () => {
  return useMutation({
    mutationFn: ({ input, accountId }: { input: SaveAccountInput; accountId?: string }) =>
      saveAccount(input, accountId),
  });
};

export const useToggleAccountMutation = () => {
  return useMutation({
    mutationFn: ({ accountId, active }: { accountId: string; active: boolean }) =>
      toggleAccount(accountId, active),
  });
};

export const usePermanentDeleteAccountMutation = () => {
  return useMutation({
    mutationFn: (accountId: string) => permanentlyDeleteAccount(accountId),
  });
};

export const useConfirmPortfolioInstrumentMutation = () =>
  useMutation({ mutationFn: (instrumentId: string) => confirmPortfolioInstrument(instrumentId) });

export const useSavePositionMutation = () => {
  return useMutation({
    mutationFn: ({ input, positionId }: { input: SavePositionInput; positionId?: string }) =>
      savePosition(input, positionId),
  });
};

export const useSaveCashBalanceMutation = () => {
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
  });
};

export const useClearPortfolioPositionsMutation = () => {
  return useMutation({
    mutationFn: (accountId: string) => clearPortfolioPositions(accountId),
  });
};

export const useRemovePortfolioPositionMutation = () => {
  return useMutation({
    mutationFn: (positionId: string) => removePortfolioPosition(positionId),
  });
};
