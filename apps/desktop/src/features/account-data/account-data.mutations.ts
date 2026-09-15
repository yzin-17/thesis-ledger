import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  confirmBaselineReconciliation,
  createExecution,
  replaceExecution,
  restoreExecution,
  voidExecution,
} from './account-data.api.js';
import { invalidatePortfolioChange } from './portfolio-change.js';
import type { PortfolioMode } from '../portfolio/portfolio.types.js';
import type {
  ConfirmBaselineReconciliationCommandV2,
  CreateExecutionCommandV2,
  ReplaceExecutionCommandV2,
  RestoreExecutionCommandV2,
  VoidExecutionCommandV2,
} from '@thesis-ledger/api-client';

const invalidateAccountData = async (
  client: ReturnType<typeof useQueryClient>,
  accountId: string,
  mode: PortfolioMode,
) => {
  await invalidatePortfolioChange(client, {
    mode,
    accountIds: [accountId],
    events: true,
    audit: true,
    reconciliation: true,
  });
};

export const useCreateExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CreateExecutionCommandV2) => createExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useReplaceExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReplaceExecutionCommandV2) => replaceExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useVoidExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: VoidExecutionCommandV2) => voidExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useRestoreExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RestoreExecutionCommandV2) => restoreExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useConfirmBaselineReconciliationMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ConfirmBaselineReconciliationCommandV2) =>
      confirmBaselineReconciliation(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};
