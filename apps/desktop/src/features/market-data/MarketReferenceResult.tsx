import type { MarketReferenceResult as Result, ReferenceColumn } from '@thesis-ledger/schemas';
import { marketReferenceCatalog, marketReferenceSourceName } from '@thesis-ledger/schemas';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

function Value({ value, column }: { value: string | null; column: ReferenceColumn }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (column.format === 'url')
    return (
      <a href={value} target="_blank" rel="noreferrer" className="underline">
        打开原文
      </a>
    );
  return value;
}

export function MarketReferenceResult({ result }: { result: Result }) {
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="市场资料查询结果">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {marketReferenceCatalog[result.dataset].label} ·{' '}
          {result.symbol ?? result.indexCode ?? '市场资料'}
        </h3>
        <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">
          来源页面
        </a>
      </div>
      <p className="text-sm text-muted-foreground">
        来源：
        {marketReferenceSourceName(result.upstreamSource)} · 抓取：{result.fetchedAt}
      </p>
      {result.status === 'empty' ? (
        <Empty className="rounded-md border border-border">
          <EmptyHeader>
            <EmptyTitle>本次条件下没有来源记录</EmptyTitle>
            <EmptyDescription>这不代表来源完整历史为空。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {result.columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(['decimal', 'integer'].includes(col.format) && 'text-right')}
                >
                  {col.label}
                  {col.unit ? `（${col.unit}）` : ''}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((row) => (
              <TableRow key={row.id}>
                {result.columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'max-w-80 whitespace-normal align-top',
                      ['decimal', 'integer'].includes(col.format) && 'text-right tabular-nums',
                    )}
                  >
                    <Value value={row.values[col.key] ?? null} column={col} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {result.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
