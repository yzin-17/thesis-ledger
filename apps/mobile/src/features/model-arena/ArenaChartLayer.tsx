import { useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ArenaPricePoint } from '@thesis-ledger/schemas';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MarketStackParams, RootTabParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { MobileChart } from '../../platform/charts/MobileChart';
import { ContentSection as Section, Action, Copy, QueryList } from '../../components/MobilePrimitives';
type Props = ComponentProps<typeof MobileChart> & { symbol: string; timeframe: string };
export function ArenaChartLayer({ symbol, timeframe, ...props }: Props) {
  const [enabled, setEnabled] = useState(false);
  if (timeframe !== '1d') return <MobileChart {...props} />;
  return (
    <>
      <Action label="模型模拟买卖点" primary={enabled} onPress={() => setEnabled(!enabled)} />
      {enabled ? <Selection key={symbol} symbol={symbol} {...props} /> : <MobileChart {...props} />}
    </>
  );
}
function Selection({ symbol, ...props }: Omit<Props, 'timeframe'>) {
  const { api, scope } = useMobileRuntime(),
    identity = useMobileIdentity();
  const [match, setMatch] = useState(''),
    [entrant, setEntrant] = useState(''),
    [day, setDay] = useState('');
  const root =
    useNavigation<NativeStackNavigationProp<MarketStackParams>>().getParent<
      BottomTabNavigationProp<RootTabParams>
    >();
  const owner = identity.data?.principal?.id;
  const key = [...scope, owner, 'arena-overlay'];
  const list = useQuery({
    queryKey: [...key, 'list'],
    queryFn: ({ signal }) => api.modelArenas.list(signal),
    enabled: !!owner,
  });
  const live = useQuery({
    queryKey: [...key, 'live-list'], queryFn: ({ signal }) => api.arenaMatches.list(signal), enabled: !!owner,
  });
  const choices =
    [...(live.data ?? []).filter((m) => m.protocol.universe === 'market' || m.protocol.instruments.some((i) => i.symbol === symbol)),
      ...(list.data ?? []).filter((m) => m.protocol.instruments.some((i) => i.symbol === symbol))];
  const active = choices.find((m) => m.id === match);
  const isLive = active?.protocol.version === 2;
  const detail = useQuery({
    queryKey: [...key, match],
    enabled: !!active,
    queryFn: async ({ signal }) => {
      if (isLive) {
        const d = await api.arenaMatches.get(match, signal);
        return { entrants: d.agents.map((a) => ({ id: a.id, model: a.model })) };
      }
      return api.modelArenas.get(match, signal);
    },
  });
  const dates = new Map(
    props.data.candles.map((c) => [
      typeof c.time === 'number'
        ? new Date(c.time * 1000).toISOString().slice(0, 10)
        : c.time.slice(0, 10),
      c.time,
    ]),
  );
  const days = [...dates.keys()].sort(),
    start = days[0]!,
    end = days.at(-1)!;
  const points = useQuery<ArenaPricePoint[]>({
    queryKey: [...key, match, entrant, symbol, start, end],
    enabled: !!active && !!start,
    queryFn: ({ signal }) => {
      const input = { symbol, start, end, ...(entrant && { entrantId: entrant }) };
      if (isLive) return api.arenaMatches.points(match, input, signal);
      return api.modelArenas.points(match, input, signal);
    },
  });
  const visible = (points.data ?? []).filter((p) => active && typeof dates.get(p.day) === 'number');
  const markers = visible.map((p) => ({
    time: Number(dates.get(p.day)),
    side: p.side,
    text: p.model + ' 模拟' + (p.side === 'buy' ? '买' : '卖'),
  }));
  return (
    <>
      <Section title="比赛与模型">
        <QueryList
          query={list}
          retry={() => void list.refetch()}
          label="正在刷新比赛列表"
          gap={12}
        >
          {live.isError && <Action label="比赛列表读取失败，重试" onPress={() => void live.refetch()} />}
          {list.isSuccess && live.isSuccess && !choices.length && <Copy>暂无包含此标的的比赛</Copy>}
          {choices.map((m) => (
            <Action
              key={m.id}
              primary={m.id === match}
              label={m.protocol.title}
              onPress={() => {
                setMatch(m.id);
                setEntrant('');
                setDay('');
              }}
            />
          ))}
        </QueryList>
        {active &&
          [{ id: '', model: '全部模型' }, ...(detail.data?.entrants ?? [])].map((e) => (
            <Action
              key={e.id}
              primary={e.id === entrant}
              label={e.model}
              onPress={() => {
                setEntrant(e.id);
                setDay('');
              }}
            />
          ))}
      </Section>
      <MobileChart
        {...props}
        data={{ ...props.data, arenaMarkers: markers }}
        onArenaTime={(time) => setDay(new Date(time * 1000).toISOString().slice(0, 10))}
      />
      {visible
        .filter((p) => !day || p.day === day)
        .map((p) => (
          <Action
            key={p.id}
            label={
              p.day +
              ' · ' +
              p.model +
              ' · 模拟' +
              (p.side === 'buy' ? '买入' : '卖出') +
              ' ' +
              p.quantity +
              ' 股 × ' +
              p.price
            }
            onPress={() => {
              if (p.roundId === null) {
                root?.navigate('Arena', { screen: 'ArenaMatch', params: { match: p.arenaId, entrant: p.entrantId } });
                return;
              }
              root?.navigate('Research', {
                screen: 'Strategy',
                params: {
                  screen: 'ModelArena',
                  params: { match: p.arenaId, round: p.roundId, entrant: p.entrantId },
                },
              });
            }}
          />
        ))}
    </>
  );
}
