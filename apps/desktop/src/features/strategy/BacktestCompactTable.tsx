import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';

export function BacktestCompactTable({
  label,
  headers,
  rows,
  empty,
  numericColumns = [],
  preserveNewlines = false,
}: {
  label: string;
  headers: string[];
  rows: string[][];
  empty: string;
  numericColumns?: number[];
  preserveNewlines?: boolean;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const visibleRows = rows.slice(offset, offset + pageSize);
  return (
    <>
      <TableContainer>
        <table aria-label={label} className="w-full min-w-[640px] text-sm">
          <TableHeader className="border-b text-left">
            <tr>
              {headers.map((header, index) => (
                <TableHead
                  key={header}
                  className={numericColumns.includes(index) ? 'text-right' : undefined}
                >
                  {header}
                </TableHead>
              ))}
            </tr>
          </TableHeader>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-center text-muted-foreground"
                  colSpan={headers.length}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              visibleRows.map((row, index) => (
                <tr key={`${row[0] ?? 'row'}-${index}`} className="border-b last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cellIndex}-${cell}`}
                      className={`px-3 py-2 ${numericColumns.includes(cellIndex) ? 'text-right tabular-nums' : 'text-left'} ${preserveNewlines ? 'max-w-sm whitespace-pre-line break-words' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableContainer>
      {rows.length > pageSize && (
        <nav
          aria-label={`${label}分页`}
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="text-muted-foreground" aria-live="polite">
            共 {rows.length} 条，第 {offset + 1}–{Math.min(offset + pageSize, rows.length)} 条 · 第{' '}
            {currentPage}/{pageCount} 页
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
