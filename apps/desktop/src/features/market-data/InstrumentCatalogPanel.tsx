import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';
import type { CatalogStatus, InstrumentResult } from './market-data.types.js';

export function InstrumentCatalogPanel({
  catalog,
  disabled,
  syncing,
  searchBusy,
  searchResults,
  confirmingId,
  onSync,
  onSearch,
  onConfirm,
}: {
  catalog: CatalogStatus | null;
  disabled: boolean;
  syncing: boolean;
  searchBusy: boolean;
  searchResults: InstrumentResult[];
  confirmingId: string | null;
  onSync: () => void;
  onSearch: (query: string) => void;
  onConfirm: (instrument: InstrumentResult) => void;
}) {
  const [searchText, setSearchText] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(searchText.trim());
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">标的目录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              完整快照、generation 与 ACK 由服务端原子切换。
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onSync} disabled={disabled || syncing}>
            {syncing && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {syncing ? '同步中…' : '同步目录'}
          </Button>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="border border-border p-3">
            <span className="block text-muted-foreground">当前 generation</span>
            <strong className="mt-1 block font-mono">{catalog?.generation ?? '—'}</strong>
          </div>
          <div className="border border-border p-3">
            <span className="block text-muted-foreground">本地标的数量</span>
            <strong className="mt-1 block font-mono">{catalog?.instrumentCount ?? '—'}</strong>
          </div>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <span className="block text-sm font-medium">搜索已同步标的</span>
          <div className="flex gap-2">
            <Input
              aria-label="搜索已同步标的"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="代码、名称或拼音首字母"
            />
            <Button type="submit" variant="outline" disabled={searchBusy}>
              {searchBusy ? '搜索中…' : '搜索'}
            </Button>
          </div>
        </form>
        {searchResults.length > 0 && (
          <div className="divide-y border-y border-border">
            {searchResults.map((instrument) => (
              <div key={instrument.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-medium">
                    {instrument.displayName}
                  </strong>
                  <span className="font-mono text-xs text-muted-foreground">
                    {instrument.symbol} · {instrument.instrumentType}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!instrument.confirmable || confirmingId !== null}
                  onClick={() => onConfirm(instrument)}
                >
                  {confirmingId === instrument.id && (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {instrument.confirmable ? '确认标的' : '已确认'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
