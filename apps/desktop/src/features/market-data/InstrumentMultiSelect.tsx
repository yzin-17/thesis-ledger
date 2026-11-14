import { useRef, useState } from 'react';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput,
  ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList,
  ComboboxValue, useComboboxAnchor,
} from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { useInstrumentPickerSearch } from './instrument-picker.queries.js';

type SelectedInstrument = Pick<InstrumentSearchResult, 'id' | 'symbol' | 'displayName'>;

export function InstrumentMultiSelect({ selected, onSelect, onRemove, accepts, label }: {
  selected: SelectedInstrument[];
  onSelect: (item: InstrumentSearchResult) => boolean;
  onRemove: (id: string) => void;
  accepts: (item: InstrumentSearchResult) => boolean;
  label: string;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const anchor = useComboboxAnchor();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useInstrumentPickerSearch(input, open);
  const selectedIds = selected.map((item) => item.id);
  const items = (search.isError ? [] : (search.data ?? [])).filter(
    (item) => item.active && accepts(item),
  );
  const itemLabel = (item: SelectedInstrument) => {
    if (item.displayName === item.symbol) return item.symbol;
    return `${item.displayName} · ${item.symbol}`;
  };
  const searchFailed = search.current && search.isError;
  let status = '未找到符合当前条件的标的';
  if (searchFailed) status = '标的目录暂时无法读取，请重试';
  return (
    <Combobox
      multiple
      autoHighlight
      filter={null}
      items={items.map((item) => item.id)}
      value={selectedIds}
      inputValue={input}
      open={open && Boolean(input.trim())}
      onOpenChange={setOpen}
      itemToStringLabel={(id: string) => {
        const item = selected.find((item) => item.id === id) ?? items.find((item) => item.id === id);
        return item ? itemLabel(item) : id;
      }}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change' || details.reason === 'clear-press') {
          setInput(next);
          setOpen(true);
        }
      }}
      onValueChange={(next, details) => {
        const removed = selectedIds.find((id) => !next.includes(id));
        if (removed) {
          onRemove(removed);
          if (details.reason === 'item-press') setInput('');
          return;
        }
        const added = items.find((item) => next.includes(item.id) && !selectedIds.includes(item.id));
        if (added && !search.busy && onSelect(added)) setInput('');
      }}
    >
      <ComboboxChips ref={anchor} className="min-w-0">
        <ComboboxValue>
          {(values: string[]) => <>
            {values.map((id) => {
              const item = selected.find((item) => item.id === id);
              if (!item) return null;
              const name = itemLabel(item);
              return <ComboboxChip key={id} removeLabel={`移除 ${item.displayName}`}>
                <span className="min-w-0 truncate" title={name}>{name}</span>
              </ComboboxChip>;
            })}
            <ComboboxChipsInput
              ref={inputRef}
              aria-label={label}
              aria-busy={search.busy}
              className="min-w-0 basis-28"
              onFocus={() => setOpen(true)}
            />
          </>}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor} positionMethod="fixed" className="min-w-0">
        <ListRefreshRegion refreshing={search.busy && items.length > 0} label="正在刷新标的搜索">
          <ComboboxEmpty aria-live="polite">
            {search.busy ? <LoadingState label="正在搜索标的" /> : status}
          </ComboboxEmpty>
          {searchFailed && <Button
            type="button" size="sm" variant="outline" disabled={search.busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { void search.refetch(); inputRef.current?.focus(); }}
          >重试标的搜索</Button>}
          <ComboboxList>
            {items.map((item) => <ComboboxItem key={item.id} value={item.id} disabled={search.busy}>
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate" title={item.displayName}>{item.displayName}</span>
                <span className="text-xs text-muted-foreground">{item.symbol}</span>
              </span>
            </ComboboxItem>)}
          </ComboboxList>
        </ListRefreshRegion>
      </ComboboxContent>
    </Combobox>
  );
}
