import { useEffect, useState } from 'react';
import { debounce } from 'es-toolkit';
import { useQuery } from '@tanstack/react-query';
import { getDesktopApiClient } from '../../shared/api/client.js';

/** Only search the local directory. Selection never confirms or creates an asset. */
export function useInstrumentPickerSearch(input: string, enabled: boolean) {
  const text = input.trim();
  const origin = typeof window === 'undefined' ? 'ssr' : window.location.origin;
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const update = debounce(() => setSettled(text), 300);
    update();
    return () => update.cancel();
  }, [text]);
  const current = text === settled;
  const query = useQuery({
    queryKey: ['desktop', 'market-data', 'instrument-picker', origin, settled],
    queryFn: ({ signal }) =>
      getDesktopApiClient().market.searchInstruments({ q: settled, limit: 30 }, signal),
    enabled: enabled && Boolean(settled) && current,
    staleTime: 30_000,
    retry: false,
  });
  return {
    ...query,
    data: current ? query.data : undefined,
    busy: Boolean(text) && (!current || query.isFetching),
    current,
  };
}
