import type { Dispatch, SetStateAction } from 'react';
import type { useToastManager } from '@/components/ui/toast';

import type { Account, HeldAssetType, InstrumentLookup, Position } from './portfolio.types.js';
import type {
  useConfirmPortfolioInstrumentMutation,
  useClearPortfolioPositionsMutation,
  useRemovePortfolioPositionMutation,
  useSaveAccountMutation,
  useSaveCashBalanceMutation,
  useSavePositionMutation,
  useToggleAccountMutation,
} from './portfolio.mutations.js';
import { createAccountActionHandlers } from './portfolio.account-actions.js';
import { createInstrumentActionHandlers } from './portfolio.instrument-actions.js';
import { createPositionActionHandlers } from './portfolio.position-actions.js';

export type PortfolioToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;

export type PortfolioMutationBundle = {
  saveAccount: ReturnType<typeof useSaveAccountMutation>;
  toggleAccount: ReturnType<typeof useToggleAccountMutation>;
  confirmInstrument: ReturnType<typeof useConfirmPortfolioInstrumentMutation>;
  savePosition: ReturnType<typeof useSavePositionMutation>;
  saveCash: ReturnType<typeof useSaveCashBalanceMutation>;
  clearPositions: ReturnType<typeof useClearPortfolioPositionsMutation>;
  removePosition: ReturnType<typeof useRemovePortfolioPositionMutation>;
};

export type PortfolioActionDependencies = {
  accounts: Account[];
  positions: Position[];
  busyAction: string | null;
  setBusyAction: Dispatch<SetStateAction<string | null>>;
  editing: Position | null;
  editingAccount: Account | null;
  selectedAccount: Account | undefined;
  calibrationMode: boolean;
  entryAccountId: string;
  selectedInstrument: InstrumentLookup | null;
  manualInstrumentEntry: boolean;
  manualAssetType: HeldAssetType;
  instrumentQuery: string;
  instrumentSelectionInProgress: { current: boolean };
  setInstrumentConfirmationBusy: Dispatch<SetStateAction<boolean>>;
  setEditing: Dispatch<SetStateAction<Position | null>>;
  setEditingAccount: Dispatch<SetStateAction<Account | null>>;
  setSelectedInstrument: Dispatch<SetStateAction<InstrumentLookup | null>>;
  setInstrumentQuery: Dispatch<SetStateAction<string>>;
  setInstrumentSearchOpen: Dispatch<SetStateAction<boolean>>;
  setManualInstrumentEntry: Dispatch<SetStateAction<boolean>>;
  setManualAssetType: Dispatch<SetStateAction<HeldAssetType>>;
  setAccountSheetOpen: Dispatch<SetStateAction<boolean>>;
  setPositionSheetOpen: (open: boolean) => void;
  markDirty: (nextDirty?: boolean) => void;
  onSaved: () => void;
  toastManager: PortfolioToastManager;
  loadManagedAccounts: () => Promise<unknown>;
  mutations: PortfolioMutationBundle;
};

export const createPortfolioActionHandlers = (dependencies: PortfolioActionDependencies) => ({
  ...createAccountActionHandlers(dependencies),
  ...createInstrumentActionHandlers(dependencies),
  ...createPositionActionHandlers(dependencies),
});
