import { useEffect, useRef, useState } from 'react';
import { debounce } from 'es-toolkit';
import type { useToastManager } from '@/components/ui/toast';

import { usePortfolioInstrumentSearchQuery } from './portfolio.queries.js';
import type {
  Account,
  InstrumentLookup,
  InstrumentSearchState,
  Position,
} from './portfolio.types.js';

type ToastManager = Pick<ReturnType<typeof useToastManager>, 'add'>;

const filterInstrumentResults = (
  accountType: Account['type'] | undefined,
  instruments: InstrumentLookup[],
) => {
  if (accountType === 'fund')
    return instruments.filter((instrument) => instrument.instrumentType === 'MUTUAL_FUND');
  return instruments.filter((instrument) => ['STOCK', 'ETF'].includes(instrument.instrumentType));
};

const resolveSearchState = ({
  selectedInstrument,
  confirmationBusy,
  debouncing,
  fetching,
  normalizedQuery,
  isError,
  isSuccess,
  hasResults,
}: {
  selectedInstrument: InstrumentLookup | null;
  confirmationBusy: boolean;
  debouncing: boolean;
  fetching: boolean;
  normalizedQuery: string;
  isError: boolean;
  isSuccess: boolean;
  hasResults: boolean;
}): InstrumentSearchState => {
  if (selectedInstrument) return 'selected';
  if (confirmationBusy || debouncing || fetching) return 'loading';
  if (!normalizedQuery) return 'idle';
  if (isError) return 'error';
  if (isSuccess && hasResults) return 'results';
  if (isSuccess) return 'empty';
  return 'idle';
};

export const usePortfolioInstrumentSearch = ({
  accountType,
  positionSheetOpen,
  editing,
  selectedInstrument,
  manualInstrumentEntry,
  instrumentConfirmationBusy,
  instrumentQuery,
  toastManager,
}: {
  accountType: Account['type'] | undefined;
  positionSheetOpen: boolean;
  editing: Position | null;
  selectedInstrument: InstrumentLookup | null;
  manualInstrumentEntry: boolean;
  instrumentConfirmationBusy: boolean;
  instrumentQuery: string;
  toastManager: ToastManager;
}) => {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const errorNotified = useRef<string | null>(null);
  const normalizedQuery = instrumentQuery.trim().toUpperCase();

  useEffect(() => {
    const updateDebouncedQuery = debounce(() => setDebouncedQuery(normalizedQuery), 500);
    updateDebouncedQuery();
    return () => updateDebouncedQuery.cancel();
  }, [normalizedQuery]);

  const searchEnabled = Boolean(
    positionSheetOpen &&
    !editing &&
    !selectedInstrument &&
    !manualInstrumentEntry &&
    !instrumentConfirmationBusy &&
    Boolean(debouncedQuery) &&
    debouncedQuery === normalizedQuery,
  );
  const query = usePortfolioInstrumentSearchQuery(accountType, debouncedQuery, searchEnabled);
  const results = filterInstrumentResults(accountType, query.data ?? []);
  const debouncing = Boolean(normalizedQuery) && debouncedQuery !== normalizedQuery;
  const busy =
    instrumentConfirmationBusy || (Boolean(normalizedQuery) && (debouncing || query.isFetching));
  const state = resolveSearchState({
    selectedInstrument,
    confirmationBusy: instrumentConfirmationBusy,
    debouncing,
    fetching: query.isFetching,
    normalizedQuery,
    isError: query.isError,
    isSuccess: query.isSuccess,
    hasResults: results.length > 0,
  });

  useEffect(() => {
    if (!query.isError || !normalizedQuery || busy || debouncedQuery !== normalizedQuery) return;
    const errorKey = `${accountType ?? 'all'}:${debouncedQuery}`;
    if (errorNotified.current === errorKey) return;
    errorNotified.current = errorKey;
    toastManager.add({
      title: '标的搜索失败',
      description: '请确认市场数据与标的中心已完成目录同步。',
      type: 'error',
      timeout: 0,
      priority: 'high',
    });
  }, [accountType, busy, debouncedQuery, normalizedQuery, query.isError, toastManager]);

  return {
    debouncedQuery,
    results,
    state,
    busy,
  };
};
