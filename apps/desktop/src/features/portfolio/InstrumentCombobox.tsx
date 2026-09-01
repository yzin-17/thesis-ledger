import { Combobox } from '@base-ui/react/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/MagnifyingGlass';
import { SpinnerGapIcon } from '@phosphor-icons/react/SpinnerGap';

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
  const isLoading = busy;
  const showPopup =
    open && (Boolean(query.trim()) || isLoading || searchState !== 'idle' || results.length > 0);
  let searchStatus = '';
  if (isLoading) searchStatus = '正在搜索...';
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
    <Combobox.Root
      open={open}
      items={results}
      filter={null}
      inputValue={query}
      autoHighlight
      onOpenChange={onOpenChange}
      onInputValueChange={onQueryChange}
      onValueChange={(instrument) => {
        if (instrument) onSelect(instrument);
      }}
      itemToStringLabel={(instrument: InstrumentLookup) => instrument.displayName}
      itemToStringValue={(instrument: InstrumentLookup) => instrument.symbol}
    >
      <InputGroup className="h-10">
        <Combobox.Input
          data-slot="input-group-control"
          className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2.5 py-2 text-base text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          placeholder="搜索代码或名称"
          aria-label="搜索代码或名称"
          aria-busy={busy}
          onFocus={onStartSearch}
        />
        <InputGroupAddon align="inline-start">
          <MagnifyingGlassIcon aria-hidden="true" />
        </InputGroupAddon>
        {isLoading && (
          <InputGroupAddon align="inline-end">
            <SpinnerGapIcon className="animate-spin" aria-hidden="true" />
          </InputGroupAddon>
        )}
      </InputGroup>
      {showPopup && (
        <Combobox.Portal>
          <Combobox.Positioner
            className="layer-popover"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <Combobox.Popup
              aria-label="标的搜索结果"
              className="w-(--anchor-width) overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
            >
              <Combobox.List className="max-h-72 overflow-auto p-1">
                <Combobox.Status className="px-3 py-2 text-sm text-muted-foreground">
                  {searchStatus}
                </Combobox.Status>
                {!isLoading &&
                  searchState === 'results' &&
                  results.map((instrument, index) => (
                    <Combobox.Item
                      key={instrument.id}
                      value={instrument}
                      index={index}
                      className="flex w-full cursor-default items-start gap-3 rounded-sm px-3 py-2 text-left outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span className="min-w-0 flex-1">
                        <code className="block font-mono text-xs text-muted-foreground">
                          {instrument.symbol}
                        </code>
                        <strong className="mt-0.5 block truncate text-sm font-medium">
                          {instrument.displayName}
                        </strong>
                        <small className="mt-0.5 block text-xs text-muted-foreground">
                          {instrumentTypeLabel(instrument.instrumentType)} ·{' '}
                          {instrumentMarketLabel(instrument.market)}
                        </small>
                      </span>
                    </Combobox.Item>
                  ))}
                <Combobox.Empty className="px-3 py-2">
                  {searchState === 'empty' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        未找到“{query}”
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={onManualEntry}>
                        手动录入标的
                      </Button>
                    </div>
                  )}
                </Combobox.Empty>
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      )}
    </Combobox.Root>
  );
}
