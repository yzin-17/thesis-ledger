import { useMemo, useState } from 'react';
import { backtestDailyOrderResultSchema } from '@thesis-ledger/schemas';
import { backtestDailyOrderResultRows, backtestDailyMatchingLines, backtestDailyOrderStateOptions } from '@thesis-ledger/domain';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BacktestCompactTable } from './BacktestCompactTable.js';

export function BacktestDailyOrders({ value, unit }: { value: unknown; unit: string }) {
  const [draft, setDraft] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const parsed = useMemo(() => backtestDailyOrderResultSchema.safeParse(value), [value]);
  const all = useMemo(() => parsed.success ? backtestDailyOrderResultRows(parsed.data.orders, parsed.data.matching.liquidity) : [], [parsed]);
  if (value === undefined) return null;
  if (!parsed.success) return <p role="alert">委托结果无法读取，请查看原始结果证据。</p>;
  const rows = all.filter(row => (filter === 'all' || row.stateCode === filter) && row.search.includes(query.trim().toLowerCase()));
  const actualUnit = parsed.data.orders[0]?.quantityBasis === 'normalized-units' ? '研究单位' : unit;
  return <section className="flex min-w-0 flex-col gap-3">
    <h3 className="font-medium">日线委托与保护</h3>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); setQuery(draft); }}>
      <Input className="min-w-40 flex-1" aria-label="搜索委托" placeholder="委托、父单或周期" value={draft} onChange={e => setDraft(e.target.value)} />
      <Button type="submit" variant="secondary">搜索</Button>
      <Button type="button" variant="outline" onClick={() => { setDraft(''); setQuery(''); setFilter('all'); }}>清空</Button>
    </form>
    <ToggleGroup className="max-w-full flex-wrap" value={[filter]} onValueChange={values => { if (values[0]) setFilter(values[0]); }} aria-label="委托状态筛选">
      {backtestDailyOrderStateOptions.map(({ value, label }) => <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>)}
    </ToggleGroup>
    <p className="text-sm text-muted-foreground">序号按冻结日线序列计，包含预热；保护建立与最早撮合分别列出，实际成交时间见成交列表。共 {rows.length} 张匹配委托。</p>
    <BacktestCompactTable key={`${filter}:${query}`} label="日线委托与保护" headers={['委托', '动作', '状态', '数量', '价格／期限／父单', '激活与撮合']} preserveNewlines
      rows={rows.map(row => [row.identity, row.action, row.state, row.quantity, row.terms, row.timing])} empty="没有匹配的委托" />
    {backtestDailyMatchingLines(parsed.data.matching, actualUnit).map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
  </section>;
}
