import { useMutation, useQueryClient } from '@tanstack/react-query';

import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import {
  confirmBaselineReconciliation,
  createExecution,
  replaceExecution,
  restoreExecution,
  voidExecution,
} from './account-data.api.js';
import { accountDataKeys } from './account-data.queries.js';
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
) => {
  await Promise.all([
    client.invalidateQueries({ queryKey: accountDataKeys.root }),
    client.invalidateQueries({ queryKey: portfolioKeys.root }),
    client.invalidateQueries({ queryKey: accountDataKeys.events(accountId, 'unknown', 'all') }),
  ]);
};

export const useCreateExecutionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: CreateExecutionCommandV2) => createExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId),
  });
};

export const useReplaceExecutionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReplaceExecutionCommandV2) => replaceExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId),
  });
};

export const useVoidExecutionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: VoidExecutionCommandV2) => voidExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId),
  });
};

export const useRestoreExecutionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RestoreExecutionCommandV2) => restoreExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId),
  });
};

export const useConfirmBaselineReconciliationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ConfirmBaselineReconciliationCommandV2) =>
      confirmBaselineReconciliation(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId),
  });
};
