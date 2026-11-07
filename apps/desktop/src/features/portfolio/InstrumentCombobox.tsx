import { InstrumentSearchCombobox } from '../market-data/InstrumentSearchCombobox.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { Position, InstrumentLookup, InstrumentSearchState } from './portfolio.types.js';
import { instrumentTypeLabel, instrumentMarketLabel, assetTypeLabel } from './portfolio.types.js';

export function InstrumentCombobox({
  editing,
  manualEntry,
  open,
  query,
  results,
  searchState,
  selectedInstrument,
  busy,
  onClearSelection,
  onManualEntry,
  onOpenChange,
  onQueryChange,
  onSelect,
  onStartSearch,
}: {
  editing?: Position | null;
  manualEntry: boolean;
  open: boolean;
  query: string;
  results: InstrumentLookup[];
  searchState: InstrumentSearchState;
  selectedInstrument: InstrumentLookup | null;
  busy: boolean;
  onClearSelection: () => void;
  onManualEntry: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (instrument: InstrumentLookup) => void;
  onStartSearch: () => void;
}) {
  let searchStatus = '';
  if (busy) searchStatus = '正在搜索...';
  else if (searchState === 'empty') searchStatus = '未找到符合当前条件的标的';
  else if (searchState === 'error') searchStatus = '搜索暂时不可用，请稍后重试。';

  if (editing) {
    const market = editing.symbol.split('.').at(-1) ?? '';
    return (
      <div className="grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {editing.asset.name || editing.symbol}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {assetTypeLabel(editing.asset.assetType)} · {instrumentMarketLabel(market)}
            </span>
          </span>
          <code className="self-start pt-0.5 font-mono text-xs text-muted-foreground">
            {editing.symbol}
          </code>
        </div>
        <input type="hidden" name="symbol" value={editing.symbol} />
      </div>
    );
  }

  if (selectedInstrument) {
    return (
      <div className="grid gap-2">
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-left">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {selectedInstrument.displayName}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {instrumentTypeLabel(selectedInstrument.instrumentType)} ·{' '}
              {instrumentMarketLabel(selectedInstrument.market)}
            </span>
          </span>
          <div className="flex items-start gap-2">
            <code className="self-start pt-0.5 font-mono text-xs text-muted-foreground">
              {selectedInstrument.symbol}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="更换标的"
              onClick={onClearSelection}
            >
              更换
            </Button>
          </div>
        </div>
        <input type="hidden" name="symbol" value={selectedInstrument.symbol} />
      </div>
    );
  }

  if (manualEntry) {
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">未找到目录标的，请补充信息</span>
          <Button
            className="text-button"
            type="button"
            size="sm"
            variant="link"
            onClick={onClearSelection}
          >
            重新搜索
          </Button>
        </div>
        <Input
          name="symbol"
          required
          pattern="\\d{6}\\.(SH|SZ|BJ|OF)"
          value={query}
          placeholder="例如：600519.SH"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      <InstrumentSearchCombobox
        input={query} items={results} busy={busy} status={searchStatus}
        open={open} onOpenChange={(next) => { onOpenChange(next); if (next) onStartSearch(); }}
        onInputChange={onQueryChange} onSelect={onSelect}
      />
      {searchState === 'empty' && !busy && (
        <Button type="button" size="sm" variant="outline" onClick={onManualEntry}>
          手动录入标的
        </Button>
      )}
    </div>
  );
}
