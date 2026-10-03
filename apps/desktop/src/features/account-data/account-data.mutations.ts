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
  ConfirmBaselineReconciliationCommand,
  CreateExecutionCommand,
  ReplaceExecutionCommand,
  RestoreExecutionCommand,
  VoidExecutionCommand,
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
    mutationFn: (command: CreateExecutionCommand) => createExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useReplaceExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ReplaceExecutionCommand) => replaceExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useVoidExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: VoidExecutionCommand) => voidExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useRestoreExecutionMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: RestoreExecutionCommand) => restoreExecution(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};

export const useConfirmBaselineReconciliationMutation = (mode: PortfolioMode) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: ConfirmBaselineReconciliationCommand) =>
      confirmBaselineReconciliation(command),
    onSuccess: (_, command) => invalidateAccountData(queryClient, command.accountId, mode),
  });
};
