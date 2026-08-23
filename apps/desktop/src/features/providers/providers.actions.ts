import type { Dispatch, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type {
  AutomationJob,
  ProviderConnectionTestResult,
  ProviderDraft,
  ProviderDraftTestResult,
  ProviderSaveResult,
  ProviderTestEvidence,
  ProviderTestState,
  SaveProviderInput,
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
};

export const createProviderActionHandlers = (dependencies: ProviderActionDependencies) => ({
  ...createProviderConnectionHandlers(dependencies),
  ...createProviderConfigHandlers(dependencies),
  ...createProviderAutomationHandlers(dependencies),
});
