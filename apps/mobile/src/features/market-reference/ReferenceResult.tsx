import type { MarketReferenceResult } from '@thesis-ledger/schemas';
import { marketReferenceCatalog, marketReferenceSourceName } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';
import { SourceLink } from '../../components/SourceLink';

export function ReferenceResult({ data }: { data: MarketReferenceResult }) {
  const source = marketReferenceSourceName(data.upstreamSource);
  return (
    <>
      <Section title={marketReferenceCatalog[data.dataset].label}>
        <Copy>
          来源：{source} · {data.symbol ?? data.indexCode ?? '市场资料'}
        </Copy>
        <Copy muted>抓取：{data.fetchedAt}</Copy>
        <SourceLink url={data.sourceUrl} label="查看来源页面" />
      </Section>
      {data.status === 'empty' ? (
        <Copy>本次条件下没有来源记录；这不代表来源完整历史为空。</Copy>
      ) : null}
      {data.items.map((row) => (
        <Section key={row.id}>
          {data.columns.map((col) => {
            const value = row.values[col.key] ?? null;
            if (col.format === 'url' && value !== null)
              return <SourceLink key={col.key} url={value} label={col.label} />;
            return (
              <Copy key={col.key}>
                {col.label}
                {col.unit ? `（${col.unit}）` : ''}：{value ?? '—'}
              </Copy>
            );
          })}
        </Section>
      ))}
      {data.notes.map((note) => (
        <Copy key={note} muted>
          {note}
        </Copy>
      ))}
    </>
  );
}
