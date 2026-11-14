import { useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { ArenaCatalogQuery, ArenaCatalogResult } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { FilterReset } from '@/components/ui/filter-bar';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const filters = [
  { name: 'kind', label: '类型', options: [['all', '全部类型'], ['live', '自主比赛'], ['history', '日频比赛']] },
  { name: 'market', label: '市场', options: [['all', '全部市场'], ['CN', 'A股'], ['HK', '港股'], ['US', '美股']] },
  { name: 'state', label: '状态', options: [['all', '全部状态'], ['draft', '草稿'], ['running', '运行中'], ['paused', '已暂停'], ['ended', '已结束']] },
] as const;
type Change = (name: keyof ArenaCatalogQuery, value: string | number) => void;
export function arenaCatalogHasFilters(query: ArenaCatalogQuery) {
  return Boolean(query.search || query.kind !== 'all' || query.market !== 'all' || query.state !== 'all');
}
function CatalogSelect({ name, label, value, options, onChange }: {
  name: keyof ArenaCatalogQuery; label: string; value: string;
  options: readonly (readonly [string, string])[]; onChange: Change;
}) {
  let ariaLabel = '筛选比赛' + label;
  if (name === 'pageSize') ariaLabel = '每页数量';
  return <Field className="w-auto flex-row items-center gap-2">
    <FieldLabel className="shrink-0">{label}</FieldLabel>
    <Select value={value} onValueChange={(next) => { if (next) onChange(name, next); }}>
      <SelectTrigger aria-label={ariaLabel}><SelectValue>{options.find(([id]) => id === value)?.[1]}</SelectValue></SelectTrigger>
      <SelectContent className="w-max min-w-(--anchor-width) max-w-(--available-width)"><SelectGroup>
        {options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  </Field>;
}
export function ArenaCatalogControls({ query, onChange, onClear, actions }: { query: ArenaCatalogQuery; onChange: Change; onClear: () => void; actions?: ReactNode }) {
  const [search, setSearch] = useState(query.search);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => {
    if (debouncedSearch !== search) return;
    const next = debouncedSearch.trim();
    if (next !== query.search) onChange('search', next);
  }, [debouncedSearch, search, query.search, onChange]);
  return <div className="mb-card grid gap-3">
    <div className="flex min-w-0 items-center justify-between gap-3">
    <div role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-xl">
      <Field className="min-w-0 flex-1"><InputGroup>
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label="搜索比赛" placeholder="比赛名称、模型或来源" maxLength={200} value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const next = search.trim();
            setSearch(next);
            if (next !== query.search) onChange('search', next);
          }} />
      </InputGroup></Field>
    </div>
    {actions}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {filters.map((filter) => <CatalogSelect key={filter.name} {...filter} value={query[filter.name]} onChange={onChange} />)}
      <FilterReset
        hasConditions={arenaCatalogHasFilters(query) || Boolean(search)}
        onReset={() => {
          setSearch('');
          onClear();
        }}
      />
    </div>
  </div>;
}
export function ArenaCatalogPagination({ data, query, busy, onChange }: {
  data: ArenaCatalogResult; query: ArenaCatalogQuery; busy: boolean; onChange: Change;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return <div className="mt-card flex flex-wrap items-center justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{arenaCatalogHasFilters(query) ? `匹配 ${data.total} 场，共 ${data.totalUnfiltered} 场` : `共 ${data.total} 场`}</span>
    <div className="flex flex-wrap items-center gap-2">
      <CatalogSelect name="pageSize" label="每页" value={String(query.pageSize)} options={[["10", "10 条"], ["25", "25 条"], ["50", "50 条"]]} onChange={onChange} />
      <Button size="sm" variant="outline" disabled={busy || data.page <= 1} onClick={() => onChange('page', data.page - 1)}>上一页</Button>
      <span className="tabular-nums">第 {data.page} / {pages} 页</span>
      <Button size="sm" variant="outline" disabled={busy || data.page >= pages} onClick={() => onChange('page', data.page + 1)}>下一页</Button>
    </div>
  </div>;
}
