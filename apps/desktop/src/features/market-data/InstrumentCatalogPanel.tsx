import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { InstrumentCatalogRow } from './InstrumentCatalogRow.js';
import { type FormEvent, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { LoaderCircle } from 'lucide-react';
import { MarketDetailDialog } from '../market-detail/MarketDetailDialog.js';
import type { MarketDetailPosition } from '../market-detail/market-detail.types.js';
import type { CatalogStatus, InstrumentResult } from './market-data.types.js';

const marketAssetTypes: Record<string, 'stock' | 'etf' | 'fund' | undefined> = {
  STOCK: 'stock',
  ETF: 'etf',
  MUTUAL_FUND: 'fund',
};

export function InstrumentCatalogPanel({
  searchRefreshing = false,
  catalog,
  disabled,
  syncing,
  searchBusy,
  searchRequested = false,
  searchError = null,
  searchResults,
  confirmingId,
  onSync,
  onSearch,
  onRetrySearch,
  onConfirm,
}: {
  searchRefreshing?: boolean;
  catalog: CatalogStatus | null;
  disabled: boolean;
  syncing: boolean;
  searchBusy: boolean;
  searchRequested?: boolean;
  searchError?: string | null;
  searchResults: InstrumentResult[];
  confirmingId: string | null;
  onSync: () => void;
  onSearch: (query: string) => void;
  onRetrySearch?: () => void;
  onConfirm: (instrument: InstrumentResult) => void;
}) {
  const [searchText, setSearchText] = useState('');
  const [marketSubject, setMarketSubject] = useState<MarketDetailPosition | null>(null);
  const hasSearchRequest = searchRequested || searchBusy || searchResults.length > 0;
  const openMarketDetails = (instrument: InstrumentResult) => {
    const assetType = marketAssetTypes[instrument.instrumentType];
    if (!assetType) return;
    setMarketSubject({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      asset: { name: instrument.displayName, assetType },
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(searchText.trim());
  };

  return (
    <>
      <Card className="overflow-visible border-0 py-0">
        <CardHeader className="px-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-xl">标的目录</CardTitle>
              <CardDescription>搜索标的、查看行情，或确认用于持仓关联。</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={onSync} disabled={disabled || syncing}>
              {syncing && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {syncing ? '同步中…' : '同步目录'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0">
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
          <CatalogSearchResults
            searchRefreshing={searchRefreshing}
            searchBusy={searchBusy}
            searchError={searchError}
            hasSearchRequest={hasSearchRequest}
            searchResults={searchResults}
            confirmingId={confirmingId}
            onRetrySearch={onRetrySearch}
            openMarketDetails={openMarketDetails}
            onConfirm={onConfirm}
          />
        </CardContent>
      </Card>
      {marketSubject && (
        <MarketDetailDialog position={marketSubject} onClose={() => setMarketSubject(null)} />
      )}
    </>
  );
}

function CatalogSearchResults({
  searchRefreshing,
  searchBusy,
  searchError,
  hasSearchRequest,
  searchResults,
  confirmingId,
  onRetrySearch,
  openMarketDetails,
  onConfirm,
}: {
  searchRefreshing: boolean;
  searchBusy: boolean;
  searchError: string | null;
  hasSearchRequest: boolean;
  searchResults: InstrumentResult[];
  confirmingId: string | null;
  onRetrySearch: (() => void) | undefined;
  openMarketDetails: (instrument: InstrumentResult) => void;
  onConfirm: (instrument: InstrumentResult) => void;
}) {
  return (
    <ListRefreshRegion
      className="rounded-md border border-border"
      refreshing={searchRefreshing}
      label="正在刷新标的搜索"
    >
      {searchBusy && !searchRefreshing && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-busy="true"
        >
          <Spinner aria-hidden="true" />
          正在搜索本地标的…
        </div>
      )}
      {!searchBusy && searchError && (
        <Alert
          variant="destructive"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <AlertTitle>标的目录搜索失败</AlertTitle>
            <AlertDescription>{searchError}</AlertDescription>
          </div>
          <Button type="button" variant="outline" onClick={onRetrySearch}>
            重试
          </Button>
        </Alert>
      )}
      {!searchBusy && !searchError && !hasSearchRequest && (
        <Empty className="gap-2 border-0 p-4">
          <EmptyHeader>
            <EmptyTitle className="text-sm">尚未搜索标的</EmptyTitle>
            <EmptyDescription>
              输入代码、名称或拼音首字母后，搜索已同步的本地目录。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {(!searchBusy || searchRefreshing) &&
        !searchError &&
        hasSearchRequest &&
        searchResults.length === 0 && (
          <Empty className="gap-2 border-0 p-4">
            <EmptyHeader>
              <EmptyTitle className="text-sm">没有找到匹配的本地标的</EmptyTitle>
              <EmptyDescription>请调整代码、名称或拼音首字母后重新搜索。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      {searchResults.length > 0 && (
        <div className="divide-y divide-border px-4">
          {searchResults.map((instrument) => (
            <InstrumentCatalogRow
              key={instrument.id}
              instrument={instrument}
              confirmingId={confirmingId}
              onDetails={
                marketAssetTypes[instrument.instrumentType]
                  ? () => openMarketDetails(instrument)
                  : undefined
              }
              onConfirm={() => onConfirm(instrument)}
            />
          ))}
        </div>
      )}
    </ListRefreshRegion>
  );
}
