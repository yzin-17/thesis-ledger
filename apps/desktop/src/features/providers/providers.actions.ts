import type { Dispatch, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';
import type { ConfirmDialogOptions } from '@/components/ui/confirm-dialog';

import type {
  AutomationJob,
  AutomationJobDraft,
  CreateAutomationJobInput,
  ProviderConnectionTestResult,
  ProviderDraft,
  ProviderDraftTestResult,
  ProviderSaveResult,
  ProviderTestEvidence,
  ProviderTestState,
  SaveProviderInput,
  UpdateAutomationJobInput,
} from './providers.types.js';
import { createProviderConnectionHandlers } from './providers.connection-actions.js';
import { createProviderConfigHandlers } from './providers.config-actions.js';
import { createProviderAutomationHandlers } from './providers.automation-actions.js';

export type ProviderToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;
export type ProviderAsyncMutation<Input, Output> = {
  mutateAsync: (input: Input) => Promise<Output>;
};

export type ProviderActionDependencies = {
  providerDraft: ProviderDraft;
  credentialInputOpen: boolean;
  providerTestEvidence: ProviderTestEvidence | null;
  savingProviderDraft: boolean;
  setProviderDraft: Dispatch<SetStateAction<ProviderDraft>>;
  setProviderSheetOpen: Dispatch<SetStateAction<boolean>>;
  setEditingProviderName: Dispatch<SetStateAction<string | null>>;
  setCredentialInputOpen: Dispatch<SetStateAction<boolean>>;
  setProviderTestState: Dispatch<SetStateAction<ProviderTestState>>;
  setProviderTestEvidence: Dispatch<SetStateAction<ProviderTestEvidence | null>>;
  setTestingProviderName: Dispatch<SetStateAction<string | null>>;
  setSavingProviderName: Dispatch<SetStateAction<string | null>>;
  setTogglingJobId: Dispatch<SetStateAction<string | null>>;
  setSavingProviderDraft: Dispatch<SetStateAction<boolean>>;
  setProviderPriorityDrafts: Dispatch<SetStateAction<Record<string, number>>>;
  toastManager: ProviderToastManager;
  providerMutation: ProviderAsyncMutation<SaveProviderInput, ProviderSaveResult>;
  testProviderMutation: ProviderAsyncMutation<string, ProviderConnectionTestResult>;
  testProviderDraftMutation: ProviderAsyncMutation<SaveProviderInput, ProviderDraftTestResult>;
  toggleJobMutation: ProviderAsyncMutation<
    { jobId: string; enabled: boolean },
    Partial<AutomationJob>
  >;
  load: () => Promise<unknown>;
  resetProviderTest: () => void;
  automationSheetOpen: boolean;
  automationDraft: AutomationJobDraft;
  editingAutomationJob: AutomationJob | null;
  savingAutomationDraft: boolean;
  runningJobId: string | null;
  setAutomationSheetOpen: Dispatch<SetStateAction<boolean>>;
  setAutomationDraft: Dispatch<SetStateAction<AutomationJobDraft>>;
  setEditingAutomationJob: Dispatch<SetStateAction<AutomationJob | null>>;
  setSavingAutomationDraft: Dispatch<SetStateAction<boolean>>;
  setRunningJobId: Dispatch<SetStateAction<string | null>>;
  createJobMutation: ProviderAsyncMutation<CreateAutomationJobInput, AutomationJob>;
  updateJobMutation: ProviderAsyncMutation<
    { jobId: string; patch: UpdateAutomationJobInput },
    AutomationJob
  >;
  deleteJobMutation: ProviderAsyncMutation<string, AutomationJob>;
  runJobMutation: ProviderAsyncMutation<string, { skipped: boolean; reason?: string }>;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

export const createProviderActionHandlers = (dependencies: ProviderActionDependencies) => ({
  ...createProviderConnectionHandlers(dependencies),
  ...createProviderConfigHandlers(dependencies),
  ...createProviderAutomationHandlers(dependencies),
});
