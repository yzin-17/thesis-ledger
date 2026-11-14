import {
  nextQuoteCheck,
  readDueWatchlistPrices,
  type CheckedWatchlistPrices,
} from './watchlist-source-cadence.js';
import { useWatchlistPageVisible } from './useWatchlistVisibility.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { WatchlistAddDialog, WatchlistGroupDialog } from './WatchlistDialogs.js';
import { WatchlistTable } from './WatchlistTable.js';
import { WatchlistSelect } from './WatchlistSelect.js';
import { PageHeader } from '../shared/PageHeader.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { type WatchlistChange, type WatchlistItem } from '@thesis-ledger/schemas';
import { useSearchParams } from 'react-router';
import { watchlistMarketOptions, watchlistTypeOptions } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { MarketDetailDialog } from '../market-detail/MarketDetailDialog.js';
import { usePortfolioMode } from '../portfolio/portfolio-mode-context.js';

export function WatchlistPage() {
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
    () => 'local-workspace',
  );
  return <WatchlistWorkspace key={owner} owner={owner} />;
}

function WatchlistWorkspace(props: { owner: string }) {
  const control = useWatchlistWorkspace(props);
  const {
    refreshing,
    setManualRefreshing,
    forcePrices,
    page,
    ids,
    prices,
    catalog,
    client,
    root,
    group,
    setGroup,
    data,
    write,
    disabled,
    market,
    setFilter,
    instrumentType,
    owner,
    error,
    sourceCatalog,
    mode,
    setSelected,
    offset,
    setOffset,
    selected,
  } = control;

  return (
    <section className="flex min-w-0 flex-col gap-card">
      <PageHeader
        eyebrow="WATCHLIST"
        title="自选"
        actions={
          <RefreshIconButton
            label="刷新自选"
            refreshing={refreshing}
            onClick={() => {
              setManualRefreshing(true);
              forcePrices.current = true;
              void Promise.allSettled([
                page.refetch(),
                ...(ids.length ? [prices.refetch()] : []),
                catalog.refetch(),
                client.invalidateQueries({ queryKey: [...root, 'trends'], refetchType: 'active' }),
              ]).finally(() => setManualRefreshing(false));
            }}
          />
        }
      />
      <div className="flex min-w-0 items-center gap-2">
        <Tabs
          className="min-w-0 flex-1"
          value={group}
          onValueChange={(value) => setGroup(String(value))}
        >
          <TabsList variant="line" aria-label="自选分组">
            {[
              { id: '', name: '全部' },
              { id: 'ungrouped', name: '未分组' },
              ...(data?.groups ?? []),
            ].map((g) => (
              <TabsTrigger key={g.id} value={g.id} disabled={write.isPending}>
                {g.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <WatchlistGroupDialog
          page={data}
          group={group}
          busy={disabled}
          error={write.error}
          reset={write.reset}
          change={(op, done) => write.mutate(op, { onSuccess: done })}
        />
      </div>
      <div className="grid min-w-0 gap-group">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <WatchlistSelect
              label="市场"
              options={watchlistMarketOptions}
              value={market}
              onChange={(value) => setFilter('market', value)}
            />
            <WatchlistSelect
              label="标的类型"
              options={watchlistTypeOptions}
              value={instrumentType}
              onChange={(value) => setFilter('instrumentType', value)}
            />
          </div>
          <WatchlistAddDialog
            owner={owner}
            busy={disabled}
            error={write.error}
            reset={write.reset}
            add={(instrumentId, done) => write.mutate({ instrumentId }, { onSuccess: done })}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {requestFailureMessage(error)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          自动检查 · 后台暂停
          {prices.dataUpdatedAt > 0 && (
            <> · 报价检查 {new Date(prices.dataUpdatedAt).toLocaleTimeString('zh-CN')}</>
          )}
        </p>
        <WatchlistTable
          queryRoot={root}
          page={data}
          prices={prices.data?.rows}
          catalog={sourceCatalog}
          mode={mode}
          busy={disabled}
          refreshing={refreshing}
          filtered={Boolean(group || market || instrumentType)}
          select={setSelected}
          change={(op) => write.mutate(op)}
        />
      </div>
      <div className="flex justify-end gap-2 empty:hidden">
        {offset > 0 && (
          <Button variant="outline" onClick={() => setOffset(offset - 50)}>
            上一页
          </Button>
        )}
        {data?.nextOffset != null && (
          <Button variant="outline" onClick={() => setOffset(data.nextOffset!)}>
            下一页
          </Button>
        )}
      </div>
      {selected && (
        <MarketDetailDialog
          onClose={() => setSelected(null)}
          position={{
            instrumentId: selected.instrument.id,
            symbol: selected.instrument.canonicalCode + '.' + selected.instrument.market,
            asset: {
              name: selected.displayName,
              assetType: ({ ETF: 'etf', MUTUAL_FUND: 'fund', STOCK: 'stock' } as const)[
                selected.instrument.instrumentType
              ],
            },
          }}
        />
      )}
    </section>
  );
}

function useWatchlistWorkspace({ owner }: { owner: string }) {
  const api = getDesktopApiClient();
  const client = useQueryClient();
  const { mode } = usePortfolioMode();
  const root = ['desktop', window.location.origin, 'watchlist', owner];
  const visible = useWatchlistPageVisible();
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const trendFetching = useIsFetching({ queryKey: [...root, 'trends'] });
  const [params, setParams] = useSearchParams();
  const group = params.get('group') ?? '';
  const market = watchlistMarketOptions.find((o) => o.value === params.get('market'))?.value ?? '';
  const instrumentType =
    watchlistTypeOptions.find((o) => o.value === params.get('instrumentType'))?.value ?? '';
  const offset = Math.max(0, Math.min(2147483647, Math.trunc(Number(params.get('offset'))) || 0));
  const setFilter = (key: string, value: string) =>
    setParams(
      (last) => {
        const next = new URLSearchParams(last);
        next.delete('offset');
        next.delete('item');
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const setGroup = (value: string) => setFilter('group', value);
  const setOffset = (value: number) => setFilter('offset', String(value));

  const setSelected = (item: WatchlistItem | null) =>
    setParams(
      (last) => {
        const next = new URLSearchParams(last);
        if (item) next.set('item', item.id);
        else next.delete('item');
        return next;
      },
      { replace: true },
    );
  const page = useQuery({
    queryKey: [...root, 'page', group, market, instrumentType, offset],
    queryFn: ({ signal }) =>
      api.watchlist.list(
        {
          offset,
          ...(group && { group }),
          ...(market && { market }),
          ...(instrumentType && { instrumentType }),
        },
        signal,
      ),
    placeholderData: () => undefined,
  });
  const data = page.data;
  const selected = data?.items.find((i) => i.id === params.get('item'));
  const ids = data?.items.map((i) => i.id) ?? [];
  const forcePrices = useRef(false);
  const catalog = useQuery({
    queryKey: [...root, 'source-cadence'],
    queryFn: ({ signal }) => api.market.routeCapabilities(signal),
    enabled: visible && ids.length > 0,
    staleTime: 60_000,
    retry: false,
    refetchInterval: visible ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const sourceCatalog = catalog.isError ? undefined : catalog.data;
  const priceKey = [...root, 'prices', mode, ids];
  const prices = useQuery({
    queryKey: priceKey,
    enabled: ids.length > 0 && visible,
    queryFn: ({ signal }) => {
      const force = forcePrices.current;
      forcePrices.current = false;
      return readDueWatchlistPrices(
        client.getQueryData<CheckedWatchlistPrices>(priceKey),
        data?.items ?? [],
        sourceCatalog,
        (due) => api.watchlist.prices(due, mode, signal),
        force,
      );
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) => {
      const next = nextQuoteCheck(
        query.state.data,
        data?.items ?? [],
        sourceCatalog,
        query.state.errorUpdatedAt,
      );
      return visible && Number.isFinite(next) ? Math.max(1000, next - Date.now()) : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    placeholderData: () => undefined,
  });
  const write = useMutation({
    mutationFn: (op: WatchlistChange | { instrumentId: string }) => {
      if ('instrumentId' in op)
        return api.watchlist.add(
          op.instrumentId,
          group && group !== 'ungrouped' ? group : undefined,
        );
      return api.watchlist.change(op);
    },
    onSuccess: (_result, op) => {
      if ('action' in op && op.action === 'deleteGroup' && op.groupId === group) {
        setGroup('');
      }
      if ('action' in op && op.action === 'remove' && data?.items.length === 1)
        setOffset(Math.max(0, offset - 50));
    },
    onSettled: () => client.invalidateQueries({ queryKey: [...root, 'page'] }),
  });
  const disabled = write.isPending || !data;
  const refreshing = manualRefreshing || page.isFetching || prices.isFetching || trendFetching > 0;
  const error = page.error ?? prices.error ?? write.error;

  return {
    refreshing,
    setManualRefreshing,
    forcePrices,
    page,
    ids,
    prices,
    catalog,
    client,
    root,
    group,
    setGroup,
    data,
    write,
    disabled,
    market,
    setFilter,
    instrumentType,
    owner,
    error,
    sourceCatalog,
    mode,
    setSelected,
    offset,
    setOffset,
    selected,
  };
}
