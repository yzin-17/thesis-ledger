import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { backtestDailyOrderResultSchema } from '@thesis-ledger/schemas';
import { backtestDailyMatchingLines, backtestDailyOrderResultRows, backtestDailyOrderStateOptions } from '@thesis-ledger/domain';
import { Action, Choices, Copy, ContentSection, Field } from '../../components/MobilePrimitives';

export function BacktestDailyOrders({ value, unit }: { value: unknown; unit: string }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(1);
  const parsed = useMemo(() => backtestDailyOrderResultSchema.safeParse(value), [value]);
  const all = useMemo(() => parsed.success ? backtestDailyOrderResultRows(parsed.data.orders, parsed.data.matching.liquidity) : [], [parsed]);
  if (value === undefined) return null;
  if (!parsed.success) return <Copy>委托结果无法读取，请查看原始结果证据。</Copy>;
  const rows = all.filter(row => (filter === 'all' || row.stateCode === filter) && row.search.includes(query.trim().toLowerCase()));
  const count = Math.max(1, Math.ceil(rows.length / 10)), current = Math.min(page, count);
  const actualUnit = parsed.data.orders[0]?.quantityBasis === 'normalized-units' ? '研究单位' : unit;
  return <ContentSection title="日线委托与保护">
    <Field label="搜索委托、父单或周期" value={query} onChange={value => { setQuery(value); setPage(1); }} />
    <Choices label="委托状态筛选" value={filter} onChange={value => { setFilter(value); setPage(1); }} options={backtestDailyOrderStateOptions} />
    <Action label="清空筛选" onPress={() => { setQuery(''); setFilter('all'); setPage(1); }} />
    <Copy muted>序号按冻结日线序列计，包含预热；保护建立与最早撮合分别列出。</Copy>
    {rows.slice((current - 1) * 10, current * 10).map(row => <View key={row.id} style={{ gap: 6, paddingVertical: 12 }}>
      <Copy>{row.templateId} · {row.action} · {row.state}</Copy>
      <Copy muted>委托 {row.id}</Copy>
      <Copy>{row.quantity}</Copy><Copy>{row.terms}</Copy><Copy>{row.timing}</Copy>
    </View>)}
    {!rows.length && <Copy>没有匹配的委托。</Copy>}
    <Copy muted>共 {rows.length} 张匹配委托 · 第 {current}／{count} 页</Copy>
    {count > 1 && <><Action label="上一页" disabled={current === 1} onPress={() => setPage(current - 1)} /><Action label="下一页" disabled={current === count} onPress={() => setPage(current + 1)} /></>}
    {backtestDailyMatchingLines(parsed.data.matching, actualUnit).map(line => <Copy key={line} muted>{line}</Copy>)}
  </ContentSection>;
}
