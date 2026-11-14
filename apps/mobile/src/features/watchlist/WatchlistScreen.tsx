import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WatchlistChange, WatchlistItem, WatchlistQuery } from '@thesis-ledger/schemas';
import {
  watchlistPriceDisplay,
  watchlistMarketOptions,
  watchlistTypeOptions,
} from '@thesis-ledger/domain';
import type { MarketStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Page,
  Section,
  Action,
  Field,
  Copy,
  Choices,
  Feedback,
  QueryList,
  QueryStatus,
  failureMessage,
} from '../../components/MobilePrimitives';
import { mobileInstrument } from '../market-detail/market-model';
import { InstrumentPicker } from '../market/InstrumentPicker';

export function WatchlistScreen() {
  const { baseUrl } = useMobileRuntime();
  const identity = useMobileIdentity();
  if (identity.isPending || identity.isError || !identity.data.principal)
    return (
      <Page title="自选">
        <QueryStatus query={identity} retry={() => void identity.refetch()} />
        {!identity.isError && identity.data && !identity.data.principal && (
          <Copy>请先登录查看自选。</Copy>
        )}
      </Page>
    );
  return (
    <WatchlistView key={baseUrl + identity.data.principal.id} owner={identity.data.principal.id} />
  );
}
function useWatchlistController(owner: string) {
  const { api, scope, mode } = useMobileRuntime();
  const client = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MarketStackParams>>();
  const focused = useIsFocused();
  const [group, setGroup] = useState('');
  const [offset, setOffset] = useState(0);
  const [market, setMarket] = useState<NonNullable<WatchlistQuery['market']> | ''>('');
  const [instrumentType, setType] = useState<NonNullable<WatchlistQuery['instrumentType']> | ''>(
    '',
  );
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [manage, setManage] = useState(false);
  const root = [...scope, 'watchlist', owner];
  const page = useQuery({
    queryKey: [...root, 'page', group, market, instrumentType, offset],
    enabled: focused,
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
  const ids = data?.items.map((i) => i.id) ?? [];
  const prices = useQuery({
    queryKey: [...root, 'prices', ids],
    enabled: focused && ids.length > 0,
    queryFn: ({ signal }) => api.watchlist.prices(ids, mode, signal),
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: () => undefined,
  });
  const write = useMobileCommand(
    (op: WatchlistChange | { instrumentId: string }) =>
      'instrumentId' in op
        ? api.watchlist.add(op.instrumentId, group && group !== 'ungrouped' ? group : undefined)
        : api.watchlist.change(op),
    { refresh: false },
  );
  const mutate = async (op: WatchlistChange | { instrumentId: string }) => {
    try {
      await write.mutateAsync(op);
      setMessage(null);
      setEditing(null);
      if ('instrumentId' in op) setAdding(false);
      else if (op.action === 'deleteGroup') {
        setGroup('');
        setOffset(0);
      } else if (op.action === 'createGroup' || op.action === 'renameGroup') setName('');
      else if (op.action === 'remove' && data?.items.length === 1)
        setOffset(Math.max(0, offset - 50));
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      await client.invalidateQueries({ queryKey: [...root, 'page'] });
    }
  };
  const groups = [
    { value: '', label: '全部' },
    { value: 'ungrouped', label: '未分组' },
    ...(data?.groups ?? []).map((g) => ({ value: g.id, label: g.name })),
  ];
  const display = (item: WatchlistItem) => {
    const i = item.instrument;
    navigation.navigate('MarketDetail', {
      instrument: mobileInstrument({
        symbol: i.canonicalCode + '.' + i.market,
        displayName: item.displayName,
        instrumentType: i.instrumentType,
        market: i.market,
        id: i.id,
      }),
    });
  };
  const disabled = write.isPending || !data;
  return {
    adding,
    disabled,
    setAdding,
    mutate,
    group,
    groups,
    setGroup,
    setOffset,
    setEditing,
    market,
    setMarket,
    instrumentType,
    setType,
    setManage,
    manage,
    data,
    name,
    setName,
    write,
    message,
    prices,
    page,
    ids,
    mode,
    display,
    editing,
    offset,
  };
}

function WatchlistView({ owner }: { owner: string }) {
  const {
    adding,
    disabled,
    setAdding,
    mutate,
    group,
    groups,
    setGroup,
    setOffset,
    setEditing,
    market,
    setMarket,
    instrumentType,
    setType,
    setManage,
    manage,
    data,
    name,
    setName,
    write,
    message,
    prices,
    page,
    ids,
    mode,
    display,
    editing,
    offset,
  } = useWatchlistController(owner);
  return (
    <Page title="自选">
      <Action
        label={adding ? '收起搜索' : '添加标的'}
        disabled={disabled}
        onPress={() => setAdding((v) => !v)}
      />
      {adding && (
        <InstrumentPicker
          purpose="watchlist"
          onConfirmed={(i) => void mutate({ instrumentId: i.id })}
        />
      )}
      <Choices
        label="分组"
        value={group}
        options={groups}
        disabled={disabled}
        onChange={(v) => {
          setGroup(v);
          setOffset(0);
          setEditing(null);
        }}
      />
      <Choices
        label="市场"
        value={market}
        options={watchlistMarketOptions}
        onChange={(v) => {
          setMarket(v);
          setOffset(0);
        }}
      />
      <Choices
        label="标的类型"
        value={instrumentType}
        options={watchlistTypeOptions}
        onChange={(v) => {
          setType(v);
          setOffset(0);
        }}
      />
      <Action label="管理分组" disabled={disabled} onPress={() => setManage((v) => !v)} />
      {manage && data && (
        <WatchlistGroupManager
          group={group}
          data={data}
          disabled={disabled}
          mutate={mutate}
          name={name}
          setName={setName}
        />
      )}
      <Feedback
        busy={write.isPending}
        message={message ?? (prices.error ? failureMessage(prices.error) : null)}
        error
      />
      <Action
        label="刷新"
        onPress={() => {
          void page.refetch();
          if (ids.length) void prices.refetch();
        }}
        disabled={disabled}
      />
      {data?.items.length === 0 && <Copy muted>当前名单为空，可搜索并添加标的。</Copy>}
      <QueryList
        query={page}
        relatedRefreshing={prices.isFetching}
        retry={() => void page.refetch()}
        label="正在刷新自选"
      >
        {data?.items.map((item) => {
          const snap = prices.data?.find((p) => p.itemId === item.id);
          const v = watchlistPriceDisplay(snap?.price, snap?.quoteContext);
          const peers = data.items.filter(
            (i) => i.groupId === item.groupId && i.pinned === item.pinned,
          );
          const idx = peers.findIndex((i) => i.id === item.id);
          const place = (groupId: string | null, pinned: boolean, beforeId: string | null) =>
            void mutate({
              action: 'place',
              revision: data.revision,
              itemId: item.id,
              groupId,
              pinned,
              beforeId,
            });
          return (
            <Section key={item.id} title={item.displayName}>
              <Copy>
                {item.instrument.canonicalCode}.{item.instrument.market} {v.value} {v.change}
              </Copy>
              <Copy muted>
                {[
                  item.pinned ? '置顶' : '',
                  v.status,
                  v.time,
                  v.source,
                  v.refresh,
                  v.quality,
                  watchlistHoldingLabel(snap?.held, mode),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Copy>
              <Action label="行情详情" onPress={() => display(item)} />
              <Action
                label="管理"
                disabled={disabled}
                onPress={() => setEditing(editing === item.id ? null : item.id)}
              />
              {editing === item.id && (
                <>
                  <Action
                    label={item.pinned ? '取消置顶' : '置顶'}
                    disabled={disabled}
                    onPress={() => place(item.groupId, !item.pinned, null)}
                  />
                  <Choices
                    label="移至分组"
                    disabled={disabled}
                    value={item.groupId ?? 'ungrouped'}
                    options={groups.slice(1)}
                    onChange={(g) => place(g === 'ungrouped' ? null : g, item.pinned, null)}
                  />
                  {idx > 0 && (
                    <Action
                      label="上移"
                      disabled={disabled}
                      onPress={() => place(item.groupId, item.pinned, peers[idx - 1]!.id)}
                    />
                  )}
                  {idx + 1 < peers.length && (
                    <Action
                      label="下移"
                      disabled={disabled}
                      onPress={() =>
                        void mutate({
                          action: 'place',
                          itemId: peers[idx + 1]!.id,
                          groupId: item.groupId,
                          pinned: item.pinned,
                          beforeId: item.id,
                          revision: data.revision,
                        })
                      }
                    />
                  )}
                  <Action
                    label="移出自选"
                    disabled={disabled}
                    onPress={() =>
                      void mutate({ action: 'remove', itemId: item.id, revision: data.revision })
                    }
                  />
                </>
              )}
            </Section>
          );
        })}
      </QueryList>
      {offset > 0 && <Action label="上一页" onPress={() => setOffset(offset - 50)} />}
      {data?.nextOffset != null && (
        <Action label="下一页" onPress={() => setOffset(data.nextOffset!)} />
      )}
    </Page>
  );
}

function watchlistHoldingLabel(
  held: boolean | null | undefined,
  mode: ReturnType<typeof useMobileRuntime>['mode'],
) {
  if (!held) return '';
  return mode === 'actual' ? '实际持有' : '模拟持有';
}

function WatchlistGroupManager({
  group,
  data,
  disabled,
  mutate,
  name,
  setName,
}: Pick<
  ReturnType<typeof useWatchlistController>,
  'group' | 'disabled' | 'mutate' | 'name' | 'setName'
> & { data: NonNullable<ReturnType<typeof useWatchlistController>['data']> }) {
  return (
    <Section title="分组管理">
      <Field label="分组名称" value={name} onChange={setName} />
      <Action
        label="新建分组"
        disabled={disabled || !name.trim()}
        onPress={() => void mutate({ action: 'createGroup', name, revision: data.revision })}
      />
      {group && group !== 'ungrouped' ? (
        <>
          <Action
            label="重命名当前分组"
            disabled={disabled || !name.trim()}
            onPress={() =>
              void mutate({
                action: 'renameGroup',
                groupId: group,
                name,
                revision: data.revision,
              })
            }
          />
          <Action
            label="删除当前分组"
            disabled={disabled}
            onPress={() =>
              void mutate({ action: 'deleteGroup', groupId: group, revision: data.revision })
            }
          />
        </>
      ) : null}
    </Section>
  );
}
