import { useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { InputGroupButton } from '@/components/ui/input-group';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';

const marketLabels: Record<string, string> = {
  SH: '上海',
  SZ: '深圳',
  BJ: '北京',
  OF: '场外基金',
  HK: '香港',
  US: '美国',
};

type CatalogChoice = Pick<InstrumentSearchResult, 'id' | 'symbol' | 'displayName' | 'market'>;

export type InstrumentSearchComboboxProps<T extends CatalogChoice> = {
  input: string;
  items: T[];
  busy: boolean;
  status: string;
  onRetry?: (() => void) | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInputChange: (input: string) => void;
  onClear?: () => void;
  clearable?: boolean;
  onSelect: (item: T) => void;
  label?: string | undefined;
  id?: string | undefined;
  disabled?: boolean;
  invalid?: boolean | undefined;
};

/** Shared accessible presentation for both directory fields and holding confirmation. */
export function InstrumentSearchCombobox<T extends CatalogChoice>({
  input,
  items,
  busy,
  status,
  onRetry,
  open,
  onOpenChange,
  onInputChange,
  onClear,
  clearable = true,
  onSelect,
  label = '搜索代码或名称',
  id,
  disabled = false,
  invalid = false,
}: InstrumentSearchComboboxProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenChange(false);
  };
  return (
    <Combobox
      items={items}
      filter={null}
      inputValue={input}
      value={null}
      autoHighlight
      open={open && !disabled}
      onOpenChange={onOpenChange}
      itemToStringLabel={(item: T) => item.symbol}
      itemToStringValue={(item: T) => item.id}
      onInputValueChange={(next, details) => {
        if (details.reason === 'input-change' || details.reason === 'clear-press') {
          if (!open) onOpenChange(true);
          onInputChange(next);
        }
      }}
      onValueChange={(item) => {
        if (item && !busy && !disabled) onSelect(item);
      }}
    >
      <ComboboxInput
        ref={inputRef}
        id={id}
        aria-label={label}
        aria-busy={busy}
        aria-invalid={invalid}
        placeholder="搜索代码或名称"
        disabled={disabled}
        onFocus={() => onOpenChange(true)}
        onClick={() => onOpenChange(true)}
        onKeyDown={closeOnEscape}
        className="w-full min-w-0"
        endActions={
          input && clearable ? (
            <InputGroupButton
              aria-label="清空标的"
              size="icon-xs"
              variant="ghost"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (onClear) {
                  inputRef.current?.focus();
                  onClear();
                  return;
                }
                onInputChange('');
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
            </InputGroupButton>
          ) : null
        }
      />
      <ComboboxContent className="min-w-0" onKeyDown={closeOnEscape}>
        <ListRefreshRegion refreshing={busy && items.length > 0} label="正在刷新标的搜索">
          <ComboboxEmpty aria-live="polite">
            {busy ? <LoadingState label="正在搜索标的" /> : status}
          </ComboboxEmpty>
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="link"
              disabled={busy}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onRetry();
                inputRef.current?.focus();
              }}
            >
              重试标的搜索
            </Button>
          )}
          <ComboboxList>
            {items.map((item) => (
              <ComboboxItem key={item.id} value={item} disabled={busy || disabled}>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate" title={item.displayName}>
                    {item.displayName}
                  </span>
                  {item.market && (
                    <span className="text-xs text-muted-foreground">
                      {item.symbol} · {marketLabels[item.market] ?? item.market}
                    </span>
                  )}
                </span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ListRefreshRegion>
      </ComboboxContent>
    </Combobox>
  );
}
