import { useState } from 'react';
import type { InstrumentDirectory, InstrumentSearchResult } from '@thesis-ledger/schemas';

/** 名称属于编辑会话；切换配置页签时保留，切换版本时隔离。 */
export function useStrategyInstrumentDirectory(directory: InstrumentDirectory | undefined, sourceKey: string) {
  const [selection, setSelection] = useState<{ sourceKey: string; item: InstrumentSearchResult } | null>(null);
  const selected = selection?.sourceKey === sourceKey ? selection.item : null;
  return {
    instrumentDirectory: {
      generation: directory?.generation ?? 0,
      items: [...(selected ? [selected] : []), ...(directory?.items ?? [])],
      unresolvedSymbols: directory?.unresolvedSymbols ?? [],
    },
    onSelect: (item: InstrumentSearchResult) => setSelection({ sourceKey, item }),
  };
}
