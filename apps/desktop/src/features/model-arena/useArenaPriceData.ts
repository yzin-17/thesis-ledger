import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ArenaPricePoint } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { MarketChartBar } from '../market-detail/market-chart-types.js';
import type { ArenaAvailability } from './useArenaEmptyToast.js';
import { arenaChartWindow, placeArenaPricePoints } from './arena-price-points.js';

export function readArenaOverlayPreference(key: string) {
  try { return window.sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}
export function rememberArenaOverlayPreference(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* 当前页仍保留用户选择。 */ }
}

function arenaAvailability(enabled: boolean, list: { isError: boolean; isSuccess: boolean; isFetching: boolean }, count: number, pointsFailed: boolean): ArenaAvailability {
  if (!enabled) return 'pending';
  if (list.isError || pointsFailed) return 'error';
  if (!list.isSuccess || list.isFetching) return 'pending';
  return count === 0 ? 'empty' : 'ready';
}

/** 模型查询与选择独立于原生图表生命周期；关闭时保留缓存但不发起新读取。 */
export function useArenaPriceData(bars: MarketChartBar[], owner: string, enabled: boolean) {
  const range = arenaChartWindow(bars);
  const symbol = bars[0]?.symbol;
  const origin = typeof window === 'undefined' ? 'http://127.0.0.1:3000' : window.location.origin;
  const key = `arena-overlay:${origin}:${owner}:${symbol ?? ''}`;
  const initial = () => ({ key, match: readArenaOverlayPreference(key), entrant: readArenaOverlayPreference(key + ':model'), day: '' });
  const [selection, setSelection] = useState(initial);
  const state = selection.key === key ? selection : initial();
  const client = getDesktopApiClient(), api = client.modelArenas;
  const root = ['desktop', origin, owner, 'arena-overlay'];
  const list = useQuery({ queryKey: [...root, 'list'], enabled, queryFn: ({ signal }) => api.list(signal) });
  const live = useQuery({ queryKey: [...root, 'live-list'], enabled, queryFn: ({ signal }) => client.arenaMatches.list(signal) });
  const choices = useMemo(() => {
    if (!enabled) return [];
    const old = (list.data ?? []).filter((m) => m.protocol.instruments.some((i) => i.symbol === symbol));
    const current = (live.data ?? []).filter((m) => m.protocol.universe === 'market' || m.protocol.instruments.some((i) => i.symbol === symbol));
    return [...current, ...old];
  }, [enabled, list.data, live.data, symbol]);
  const active = choices.find((m) => m.id === state.match);
  const isLive = active?.protocol.version === 'arena-live-match-protocol-v1';
  const detail = useQuery({
    queryKey: [...root, 'match', state.match], enabled: enabled && Boolean(active),
    queryFn: async ({ signal }) => {
      if (isLive) {
        const d = await client.arenaMatches.get(state.match, signal);
        return { entrants: d.agents.map((a) => ({ id: a.id, model: a.model })) };
      }
      return api.get(state.match, signal);
    },
  });
  const matchDetail = enabled && active ? detail.data : undefined;
  const selected = matchDetail?.entrants.find((e) => e.id === state.entrant)?.id;
  const points = useQuery<ArenaPricePoint[]>({
    queryKey: [...root, state.match, symbol, range?.start, range?.end, selected],
    enabled: enabled && Boolean(active && range),
    queryFn: ({ signal }) => {
      if (!range) throw new Error('缺少模型点位的标的与图表范围');
      const input = { symbol: range.symbol, start: range.start, end: range.end, ...(selected && { entrantId: selected }) };
      if (isLive) return client.arenaMatches.points(state.match, input, signal);
      return api.points(state.match, input, signal);
    },
  });
  const markers = useMemo(() => placeArenaPricePoints(bars, enabled && active ? points.data ?? [] : []), [bars, enabled, active, points.data]);
  const availability = arenaAvailability(enabled, {
    isError: list.isError || live.isError, isSuccess: list.isSuccess && live.isSuccess,
    isFetching: list.isFetching || live.isFetching,
  }, choices.length, Boolean(active && (points.isError || detail.isError)));
  const update = (change: Partial<typeof state>) => setSelection((current) => ({ ...(current.key === key ? current : initial()), ...change }));
  return {
    availability, choices, active, detail: matchDetail, state, markers,
    selectMatch: (id: string) => {
      rememberArenaOverlayPreference(key, id); rememberArenaOverlayPreference(key + ':model', '');
      update({ match: id, entrant: '', day: '' });
    },
    selectEntrant: (id: string) => { rememberArenaOverlayPreference(key + ':model', id); update({ entrant: id, day: '' }); },
    selectDay: (day: string | null) => update({ day: day ?? '' }),
  };
}
export type ArenaPriceData = ReturnType<typeof useArenaPriceData>;
