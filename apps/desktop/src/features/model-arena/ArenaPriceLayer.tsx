import { useState, useSyncExternalStore, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { LightweightMarketChart } from '../market-detail/MarketPriceLightweightChart.js';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';
type Props = ComponentProps<typeof LightweightMarketChart>;
function stored(key: string) {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function remember(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* 当前页仍保留用户选择。 */
  }
}
export function ArenaPriceLayer(props: Props) {
  const symbol = props.bars[0]?.symbol;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
    () => 'local-workspace',
  );
  const key = 'arena-layer:' + owner + ':' + (symbol ?? '');
  const [choice, setChoice] = useState<{ key: string; enabled: boolean } | null>(null);
  const enabled = choice?.key === key ? choice.enabled : stored(key) === 'open';
  function toggle() {
    setChoice({ key, enabled: !enabled });
    remember(key, enabled ? 'closed' : 'open');
  }
  if (!symbol || props.bars[0]?.timeframe !== '1d') return <LightweightMarketChart {...props} />;
  return (
    <>
      <Button size="sm" variant="outline" aria-pressed={enabled} onClick={toggle}>
        模型模拟买卖点
      </Button>
      {enabled ? (
        <SelectedLayer key={symbol} symbol={symbol} {...props} />
      ) : (
        <LightweightMarketChart {...props} />
      )}
    </>
  );
}
function SelectedLayer({ symbol, ...props }: Props & { symbol: string }) {
  const origin = useLocation();
  const api = getDesktopApiClient().modelArenas;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
  );
  const key = 'arena-overlay:' + window.location.origin + ':' + owner + ':' + symbol;
  const [match, setMatch] = useState(() => stored(key)),
    [entrant, setEntrant] = useState(() => stored(key + ':model')),
    [day, setDay] = useState('');
  const root = ['desktop', window.location.origin, owner, 'arena-overlay'];
  const list = useQuery({ queryKey: [...root, 'list'], queryFn: ({ signal }) => api.list(signal) });
  const choices =
    list.data?.filter((m) => m.protocol.instruments.some((i) => i.symbol === symbol)) ?? [];
  const active = choices.find((m) => m.id === match);
  const detail = useQuery({
    queryKey: [...root, 'match', match],
    enabled: !!active,
    queryFn: ({ signal }) => api.get(match, signal),
  });
  const start = props.bars[0]!.timestamp.slice(0, 10),
    end = props.bars.at(-1)!.timestamp.slice(0, 10);
  const selected = detail.data?.entrants.find((e) => e.id === entrant)?.id;
  const points = useQuery({
    queryKey: [...root, match, symbol, start, end, selected],
    enabled: !!active,
    queryFn: ({ signal }) =>
      api.points(match, { symbol, start, end, ...(selected && { entrantId: selected }) }, signal),
  });
  const data = active ? (points.data ?? []) : [];
  const valid = new Set(props.bars.map((b) => b.timestamp.slice(0, 10)));
  const overlay = {
    markers: [],
    lines: [],
    ...props.tradingOverlays,
    arenaMarkers: data.filter((f) => valid.has(f.day)),
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {choices.map((m) => (
          <Button
            size="sm"
            variant={m.id === match ? 'default' : 'outline'}
            key={m.id}
            onClick={() => {
              remember(key, m.id);
              remember(key + ':model', '');
              setMatch(m.id);
              setEntrant('');
              setDay('');
            }}
          >
            {m.protocol.title}
          </Button>
        ))}
        {active &&
          [{ id: '', model: '全部模型' }, ...(detail.data?.entrants ?? [])].map((e) => (
            <Button
              key={e.id}
              aria-pressed={e.id === entrant}
              variant="outline"
              onClick={() => {
                remember(key + ':model', e.id);
                setEntrant(e.id);
                setDay('');
              }}
            >
              {e.model}
            </Button>
          ))}
      </div>
      {(list.isError || points.isError) && <p>模拟点位读取失败</p>}
      {list.isSuccess && !points.isError && !choices.length && <p>暂无包含此标的的比赛</p>}
      <LightweightMarketChart
        {...props}
        tradingOverlays={overlay}
        onClick={(k) => {
          setDay(k ?? '');
          props.onClick(k);
        }}
      />
      {data
        .filter((p) => !day || p.day === day)
        .map((p) => (
          <div key={p.id}>
            <Link
              state={{ arenaReturn: origin.pathname + origin.search }}
              to={'/strategy/arena/' + p.arenaId + '/' + p.roundId + '#model-' + p.entrantId}
            >
              {p.day} · {p.model} · 模拟{p.side === 'buy' ? '买入' : '卖出'} {p.quantity} 股 ×{' '}
              {p.price}
            </Link>
          </div>
        ))}
    </>
  );
}
