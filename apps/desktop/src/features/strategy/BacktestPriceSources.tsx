import type { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';

const purposes = {
  execution: '成交',
  signal: '信号',
  benchmark: '基准',
  fx: '汇率',
  corporateActions: '公司行动',
  calendar: '交易日历',
  instrumentFacts: '证券事实',
  nav: '净值',
};

type Sources = ReturnType<typeof backtestResultSchemaV3.parse>['actualSources'];

export function BacktestPriceSources({ sources }: { sources: Sources }) {
  const grouped = new Map<string, { source: Sources[number]; purposes: string[] }>();
  for (const source of sources) {
    const { providerId, upstreamSource, routeIndex } = source.provenance;
    const key = JSON.stringify([source.symbol, providerId, upstreamSource, routeIndex]);
    const existing = grouped.get(key);
    const purpose = purposes[source.purpose];
    if (existing) {
      if (!existing.purposes.includes(purpose)) existing.purposes.push(purpose);
    } else grouped.set(key, { source, purposes: [purpose] });
  }
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">实际数据来源</h4>
      <ul className="flex flex-col divide-y">
        {[...grouped].map(([key, { source, purposes: uses }]) => (
          <li
            key={key}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{source.symbol}</span>
              <span className="break-all text-xs text-muted-foreground">
                {source.provenance.providerId}
                {source.provenance.upstreamSource !== source.provenance.providerId && (
                  <> / {source.provenance.upstreamSource}</>
                )}
                {' · '}
                {source.provenance.routeIndex === 0 ? '主源' : '备用源'}
              </span>
            </div>
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal">
              {uses.join(' / ')}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
