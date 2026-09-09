import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>标的目录</CardTitle>
            <CardDescription>同步并确认可用于持仓关联的标的。</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={onSync} disabled={disabled || syncing}>
            {syncing && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {syncing ? '同步中…' : '同步目录'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted-foreground">
          已收录{' '}
          <strong className="font-mono text-base font-semibold text-foreground">
            {typeof catalog?.instrumentCount === 'number'
              ? catalog.instrumentCount.toLocaleString('zh-CN')
              : '—'}
          </strong>{' '}
          个本地标的
        </p>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <span className="block text-sm font-medium">搜索已同步标的</span>
          <div className="flex flex-col gap-2 sm:flex-row">
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
