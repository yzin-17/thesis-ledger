import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
  Account,
  HeldAssetType,
  InstrumentLookup,
  InstrumentSearchState,
  Position,
} from './portfolio.types.js';

export type PortfolioManagementViewProps = {
  accounts: Account[];
  positions: Position[];
  cashValue: number | undefined;
  step: 'account' | 'position';
  managedAccounts: Account[];
  onAccountEntry: ((accountId: string) => void) | undefined;
  selectedAccount: Account | undefined;
  entryAccountLocked: boolean;
  positionSheetOpen: boolean;
  accountSheetOpen: boolean;
  entrySheetMode: 'position' | 'cash';
  entryAccountId: string;
  editing: Position | null;
  editingAccount: Account | null;
  busyAction: string | null;
  instrumentQuery: string;
  instrumentResults: InstrumentLookup[];
  instrumentSearchState: InstrumentSearchState;
  instrumentSearchBusy: boolean;
  instrumentSearchOpen: boolean;
  selectedInstrument: InstrumentLookup | null;
  manualInstrumentEntry: boolean;
  manualAssetType: HeldAssetType;
  markDirty: (nextDirty?: boolean) => void;
  confirmDiscard: () => boolean;
  openEntrySheet: (mode?: 'position' | 'cash') => void;
  toggleAccount: (account: Account) => Promise<void>;
  submitAccount: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitPosition: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitCashBalance: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  clearPositions: () => Promise<void>;
  remove: (position: Position) => Promise<void>;
  confirmInstrument: (instrument: InstrumentLookup) => Promise<void>;
  clearInstrumentSelection: () => void;
  startManualInstrumentEntry: () => void;
  handleInstrumentQueryChange: (value: string) => void;
  setAccountSheetOpen: (open: boolean) => void;
  setPositionSheetOpen: (open: boolean) => void;
  setEditingAccount: Dispatch<SetStateAction<Account | null>>;
  setEditing: Dispatch<SetStateAction<Position | null>>;
  setEntryAccountId: Dispatch<SetStateAction<string>>;
  setEntrySheetMode: Dispatch<SetStateAction<'position' | 'cash'>>;
  setSelectedInstrument: Dispatch<SetStateAction<InstrumentLookup | null>>;
  setInstrumentQuery: Dispatch<SetStateAction<string>>;
  setInstrumentSearchOpen: Dispatch<SetStateAction<boolean>>;
  setManualInstrumentEntry: Dispatch<SetStateAction<boolean>>;
  setManualAssetType: Dispatch<SetStateAction<HeldAssetType>>;
};
