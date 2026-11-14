import { useToastManager } from '@/components/ui/toast';
import { useCallback, useEffect, useState } from 'react';
import { usePortfolioInstrumentSearch } from '../portfolio/portfolio.instrument-search.js';
import { useConfirmPortfolioInstrumentMutation } from '../portfolio/portfolio.mutations.js';
import {
  accountTypeLabel,
  type Account,
  type InstrumentLookup,
} from '../portfolio/portfolio.types.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { createExecutionSubmit } from './account-data.execution-submit.js';
import {
  errorMessage,
  executionDraft,
  existingInstrument,
  supportedCurrency,
} from './account-data.helpers.js';
import {
  useCreateExecutionMutation,
  useReplaceExecutionMutation,
} from './account-data.mutations.js';
import type { ChargeDraft, ExecutionDraft, ExecutionEvent } from './account-data.types.js';

export type ExecutionSheetCloseOptions = {
  skipDiscardConfirm?: boolean;
};

function useExecutionForm({
  account,
  open,
  editingEvent,
  ledgerRevision,
  onOpenChange,
  onDirtyChange,
  resolveInstrumentName,
}: {
  account: Account;
  open: boolean;
  editingEvent: ExecutionEvent | null;
  ledgerRevision: string;
  onOpenChange: (open: boolean, options?: ExecutionSheetCloseOptions) => void;
  onDirtyChange: (dirty: boolean) => void;
  resolveInstrumentName?: (symbol: string) => string | undefined;
}) {
  const toastManager = useToastManager<object>();
  const createMutation = useCreateExecutionMutation(account.mode);
  const replaceMutation = useReplaceExecutionMutation(account.mode);
  const confirmInstrumentMutation = useConfirmPortfolioInstrumentMutation();
  const [draft, setDraft] = useState(() => executionDraft(editingEvent, account.currency));
  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const [instrumentQuery, setInstrumentQuery] = useState(editingEvent?.payload.symbol ?? '');
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentLookup | null>(
    existingInstrument(editingEvent),
  );
  const [manualInstrumentEntry, setManualInstrumentEntry] = useState(false);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const updateDirty = useCallback(
    (nextDirty = true) => {
      setDirty(nextDirty);
      onDirtyChange(nextDirty);
    },
    [onDirtyChange],
  );
  const instrumentSearch = usePortfolioInstrumentSearch({
    accountType: account.type,
    positionSheetOpen: open,
    editing: null,
    selectedInstrument,
    manualInstrumentEntry,
    instrumentConfirmationBusy: confirmInstrumentMutation.isPending,
    instrumentQuery,
    toastManager,
  });
  const accountSummary = [
    account.name,
    account.institution && account.institution !== account.name ? account.institution : null,
    account.currency,
    `${accountTypeLabel(account.type)}账户`,
  ]
    .filter(Boolean)
    .join(' · ');
  const submitting = createMutation.isPending || replaceMutation.isPending;
  useNavigationGuard({
    dirty: open && dirty,
    busy: open && submitting,
    draft: {
      accountId: account.id,
      eventId: editingEvent?.eventId,
      draft,
      charges,
      instrumentQuery,
      selectedInstrument,
      manualInstrumentEntry,
    },
  });

  useEffect(() => {
    if (!open) return;
    const nextDraft = executionDraft(editingEvent, account.currency);
    setDraft(nextDraft);
    setCharges(
      editingEvent?.payload.charges.map((charge) => ({
        category: charge.category,
        amount: charge.amount,
        currency: supportedCurrency(charge.currency),
        description: charge.description ?? '',
      })) ?? [],
    );
    setInstrumentQuery(editingEvent?.payload.symbol ?? '');
    setSelectedInstrument(existingInstrument(editingEvent));
    setManualInstrumentEntry(false);
    setInstrumentOpen(false);
    setFormError(null);
    updateDirty(false);
  }, [account.currency, editingEvent?.eventId, updateDirty, open]);

  const updateDraft = <K extends keyof ExecutionDraft>(key: K, value: ExecutionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    updateDirty(true);
  };

  const close = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (submitting) return;
    onOpenChange(false);
  };

  const confirmInstrument = async (instrument: InstrumentLookup) => {
    try {
      await confirmInstrumentMutation.mutateAsync(instrument.id);
      setSelectedInstrument(instrument);
      setInstrumentQuery(instrument.symbol);
      setInstrumentOpen(false);
      updateDirty(true);
    } catch (error) {
      setFormError(errorMessage(error, '标的确认失败，请检查标的目录。'));
    }
  };

  const submit = createExecutionSubmit({
    submitting,
    setFormError,
    selectedInstrument,
    draft,
    charges,
    editingEvent,
    replaceMutation,
    createMutation,
    account,
    ledgerRevision,
    toastManager,
    updateDirty,
    onOpenChange,
  });

  return {
    open,
    close,
    editingEvent,
    submit,
    accountSummary,
    resolveInstrumentName,
    manualInstrumentEntry,
    instrumentOpen,
    instrumentQuery,
    instrumentSearch,
    selectedInstrument,
    setSelectedInstrument,
    setInstrumentQuery,
    updateDirty,
    setManualInstrumentEntry,
    setInstrumentOpen,
    confirmInstrument,
    draft,
    updateDraft,
    setCharges,
    charges,
    formError,
    submitting,
  };
}

export { useExecutionForm };
