import type { ReactNode } from 'react';
import { TableCell, TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import type { LoadState } from '../shared/types.js';

export const providerReadEmptyLabel = (state: LoadState | undefined, subject: string) => {
  if (state === 'loading') return `正在读取${subject}…`;
  if (state === 'error') return `${subject}读取失败，请重新读取。`;
  if (state === 'stale') return `${subject}更新失败，当前没有可显示记录。`;
  return `暂无${subject}。`;
};

export function SimpleProviderTable({
  refreshing = false,
  title,
  description,
  columns,
  rows,
  emptyColSpan,
  emptyState,
  footer,
  loadState,
  onRetry,
  notice,
  controls,
  wrapColumns = [],
  tableClassName,
  columnClassNames,
}: {
  refreshing?: boolean;
  title: string;
  description: string;
  columns: string[];
  rows: Array<{ id: string; cells: string[] }>;
  emptyColSpan: number;
  emptyState?: ReactNode;
  footer?: ReactNode;
  loadState?: LoadState;
  onRetry?: (() => void) | undefined;
  notice?: ReactNode;
  controls?: ReactNode;
  wrapColumns?: readonly number[];
  tableClassName?: string;
  columnClassNames?: readonly string[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {notice}
      {controls}
      {(loadState === 'error' || loadState === 'stale') && (
        <DataStateBanner
          state={loadState}
          title={`${title}${loadState === 'stale' ? '更新失败' : '读取失败'}`}
          description={
            loadState === 'stale' ? '保留上次读取的记录，请重新加载。' : '请重新加载后查看记录。'
          }
          {...(onRetry ? { onRetry } : {})}
        />
      )}
      <TableContainer refreshing={refreshing} refreshLabel={`正在刷新${title}`}>
        <table className={tableClassName}>
          <TableHeader>
            <tr>
              {columns.map((column, index) => (
                <TableHead key={column} className={columnClassNames?.[index]}>
                  {column}
                </TableHead>
              ))}
            </tr>
          </TableHeader>
          <tbody>
            {rows.length === 0
              ? (emptyState ?? (
                  <EmptyTableRow
                    colSpan={emptyColSpan}
                    loading={loadState === 'loading'}
                    label={providerReadEmptyLabel(loadState, title)}
                  />
                ))
              : rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => (
                      <TableCell
                        key={`${row.id}-${index}`}
                        className={
                          wrapColumns.includes(index)
                            ? 'min-w-48 max-w-lg whitespace-pre-wrap break-words'
                            : undefined
                        }
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </TableContainer>
      {footer}
    </section>
  );
}
