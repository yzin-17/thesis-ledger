import type { PortfolioActionDependencies } from './portfolio.actions.js';
import type { InstrumentLookup } from './portfolio.types.js';

export const createInstrumentActionHandlers = ({
  editing,
  instrumentQuery,
  manualInstrumentEntry,
  instrumentSelectionInProgress,
  selectedAccount,
  mutations,
  setInstrumentConfirmationBusy,
  setInstrumentSearchOpen,
  setInstrumentQuery,
  setSelectedInstrument,
  setManualInstrumentEntry,
  setManualAssetType,
  markDirty,
  toastManager,
}: PortfolioActionDependencies) => {
  const handleInstrumentQueryChange = (value: string) => {
    if (editing || instrumentSelectionInProgress.current) return;
    const nextQuery = value.toUpperCase();
    if (manualInstrumentEntry) {
      setInstrumentQuery(nextQuery);
      return;
    }
    if (nextQuery === instrumentQuery) {
      if (nextQuery.trim()) setInstrumentSearchOpen(true);
      return;
    }
    setInstrumentQuery(nextQuery);
    setSelectedInstrument(null);
    setManualInstrumentEntry(false);
    setInstrumentSearchOpen(Boolean(nextQuery.trim()));
  };

  const confirmInstrument = async (instrument: InstrumentLookup) => {
    if (!instrument.confirmable || editing) return;
    instrumentSelectionInProgress.current = true;
    setInstrumentConfirmationBusy(true);
    setInstrumentSearchOpen(false);
    setInstrumentQuery(instrument.symbol);
    try {
      await mutations.confirmInstrument.mutateAsync(instrument.id);
      setSelectedInstrument(instrument);
      setManualInstrumentEntry(false);
      markDirty(true);
    } catch {
      toastManager.add({
        title: '标的确认失败',
        description: '标的确认暂时不可用，请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      instrumentSelectionInProgress.current = false;
      setInstrumentConfirmationBusy(false);
    }
  };

  const clearInstrumentSelection = () => {
    setSelectedInstrument(null);
    setManualInstrumentEntry(false);
    setInstrumentQuery('');
    setInstrumentSearchOpen(false);
  };

  const startManualInstrumentEntry = () => {
    setManualInstrumentEntry(true);
    setInstrumentSearchOpen(false);
    setManualAssetType(selectedAccount?.type === 'fund' ? 'fund' : 'stock');
    markDirty(true);
  };

  return {
    handleInstrumentQueryChange,
    confirmInstrument,
    clearInstrumentSelection,
    startManualInstrumentEntry,
  };
};
