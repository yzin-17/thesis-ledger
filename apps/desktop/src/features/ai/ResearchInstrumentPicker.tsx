import { useDeferredValue, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { usePortfolioInstrumentSearchQuery } from '../portfolio/portfolio.queries.js';
import type { InstrumentLookup } from '../portfolio/portfolio.types.js';

/** 只选择目录 ID；不调用创建持仓使用的确认/关联接口。 */
export function ResearchInstrumentPicker({
  value,
  onChange,
}: {
  value: InstrumentLookup | null;
  onChange: (value: InstrumentLookup | null) => void;
}) {
  const [input, setInput] = useState('');
  const query = useDeferredValue(input.trim());
  const search = usePortfolioInstrumentSearchQuery(undefined, query, query.length > 0 && !value);
  const items = (search.data ?? []).filter((item) =>
    ['STOCK', 'ETF', 'INDEX', 'MUTUAL_FUND'].includes(item.instrumentType),
  );
  return (
    <Field>
      <FieldLabel>独立研究标的</FieldLabel>
      <Combobox
        inputValue={input}
        items={items}
        filter={null}
        value={value}
        onValueChange={onChange}
        itemToStringLabel={(item: InstrumentLookup) => item.displayName}
        itemToStringValue={(item: InstrumentLookup) => item.symbol}
        onInputValueChange={(next) => {
          setInput(next);
          if (value && next !== value.displayName) onChange(null);
        }}
      >
        <ComboboxInput aria-label="研究标的" placeholder="搜索代码或名称" showClear />
        <ComboboxContent>
          <ComboboxEmpty>{search.isFetching ? '正在搜索…' : '未找到可用规范标的'}</ComboboxEmpty>
          <ComboboxList>
            {(item: InstrumentLookup) => (
              <ComboboxItem key={item.id} value={item}>
                {item.displayName} · {item.symbol}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>
        {value
          ? `${value.displayName} · ${value.symbol}。本范围只使用公开资料。`
          : '可选择股票、交易所基金、指数和有资格的场外基金，不需要创建持仓。'}
      </FieldDescription>
      {search.isError && <FieldDescription>标的目录暂时无法读取，请重新搜索。</FieldDescription>}
    </Field>
  );
}
