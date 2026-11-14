import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { FilterReset } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LoadState } from '../shared/types.js';
import type { RiskEventRecord } from './risk.types.js';
import { riskSeverityLabel } from './risk.format.js';
import { RiskEventTable } from './RiskSections.js';

const PAGE_SIZE = 20;
const severityOptions = ['all', 'info', 'warning', 'error', 'critical'] as const;
const severityLabel = (value: string) => (value === 'all' ? '全部级别' : riskSeverityLabel(value));

export function RiskOverviewEvents({
  events,
  loadState,
  refreshing = false,
  onRetry,
}: {
  events: RiskEventRecord[];
  loadState: LoadState;
  refreshing?: boolean | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.get('eventSearch') ?? '';
  const requestedSeverity = params.get('eventSeverity') ?? 'all';
  const severity = severityOptions.find((value) => value === requestedSeverity) ?? 'all';
  const [draftSearch, setDraftSearch] = useState(search);
  const debouncedSearch = useDebouncedValue(draftSearch);
  useEffect(() => setDraftSearch(search), [search]);
  const applySearch = useCallback(
    (value: string) => {
      const next = value.trim();
      if (next === search) return;
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next) updated.set('eventSearch', next);
          else updated.delete('eventSearch');
          updated.delete('eventPage');
          return updated;
        },
        { replace: true },
      );
    },
    [search, setParams],
  );
  useEffect(() => {
    if (debouncedSearch !== draftSearch) return;
    applySearch(debouncedSearch);
  }, [debouncedSearch, draftSearch, applySearch]);
  const filtered = events
    .filter((event) => {
      if (severity !== 'all' && event.severity !== severity) return false;
      return `${event.message} ${event.symbol ?? ''}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase());
    })
    .sort(
      (left, right) =>
        Date.parse(right.evaluatedAt) - Date.parse(left.evaluatedAt) ||
        right.id.localeCompare(left.id),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requestedPage = Number(params.get('eventPage') ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pageCount)
      : 1;
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };
  return (
    <section id="risk-events" aria-label="风险事件记录" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">风险事件</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜索风险事件"
          placeholder="搜索事件或标的"
          className="min-w-0 flex-1"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applySearch(draftSearch);
          }}
        />
        <Select
          value={severity}
          onValueChange={(value) =>
            value && update({ eventSeverity: value === 'all' ? null : value, eventPage: null })
          }
        >
          <SelectTrigger aria-label="事件级别" className="w-32 shrink-0">
            <SelectValue>{severityLabel(severity)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {severityOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {severityLabel(value)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FilterReset
          className="shrink-0"
          hasConditions={Boolean(search || draftSearch || severity !== 'all')}
          onReset={() => {
            setDraftSearch('');
            update({ eventSearch: null, eventSeverity: null, eventPage: null });
          }}
        />
      </div>
      {events.length >= 200 && (
        <p className="text-xs text-muted-foreground">显示最近 200 条事件</p>
      )}
      <RiskEventTable
        events={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
        loadState={loadState}
        refreshing={refreshing}
        onRetry={onRetry}
      />
      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            共 {filtered.length} 条 · 第 {page}/{pageCount} 页
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => update({ eventPage: page === 2 ? null : String(page - 1) })}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === pageCount}
              onClick={() => update({ eventPage: String(page + 1) })}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
