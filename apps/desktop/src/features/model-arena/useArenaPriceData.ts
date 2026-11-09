import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const api = getDesktopApiClient().modelArenas;
  const root = ['desktop', origin, owner, 'arena-overlay'];
  const list = useQuery({ queryKey: [...root, 'list'], enabled, queryFn: ({ signal }) => api.list(signal) });
  const choices = useMemo(() => enabled ? list.data?.filter((m) => m.protocol.instruments.some((i) => i.symbol === symbol)) ?? [] : [], [enabled, list.data, symbol]);
  const active = choices.find((m) => m.id === state.match);
  const detail = useQuery({
    queryKey: [...root, 'match', state.match], enabled: enabled && Boolean(active),
    queryFn: ({ signal }) => api.get(state.match, signal),
  });
  const matchDetail = enabled && active ? detail.data : undefined;
  const selected = matchDetail?.entrants.find((e) => e.id === state.entrant)?.id;
  const points = useQuery({
    queryKey: [...root, state.match, symbol, range?.start, range?.end, selected],
    enabled: enabled && Boolean(active && range),
    queryFn: ({ signal }) => {
      if (!range) throw new Error('缺少模型点位的标的与图表范围');
      return api.points(state.match, { symbol: range.symbol, start: range.start, end: range.end, ...(selected && { entrantId: selected }) }, signal);
    },
  });
  const markers = useMemo(() => placeArenaPricePoints(bars, enabled && active ? points.data ?? [] : []), [bars, enabled, active, points.data]);
  const availability = arenaAvailability(enabled, list, choices.length, Boolean(active && points.isError));
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
