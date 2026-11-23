import { ArenaEmptyToast } from './ArenaEmptyToast.js';
import { useArenaEmptyToast, type ArenaAvailability } from './useArenaEmptyToast.js';
import { InfoTip } from '@/components/ui/info-tip';
import { arenaChartWindow } from './arena-price-points.js';
import { useArenaPriceData, readArenaOverlayPreference, rememberArenaOverlayPreference, type ArenaPriceData } from './useArenaPriceData.js';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { ArenaPointDetails } from './ArenaPointDetails.js';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LightweightMarketChart } from '../market-detail/MarketPriceLightweightChart.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';
type Props = ComponentProps<typeof LightweightMarketChart>;
export function ArenaPriceLayer({ renderControls, ...props }: Props & {
  renderControls?: ((modelToggle: ReactNode) => ReactNode) | undefined;
}) {
  const symbol = props.bars[0]?.symbol;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
    () => 'local-workspace',
  );
  const key = 'arena-layer:' + owner + ':' + (symbol ?? '');
  const [choice, setChoice] = useState<{ key: string; enabled: boolean } | null>(null);
  const notice = useArenaEmptyToast(JSON.stringify([key, props.bars[0]?.timeframe, props.bars[0]?.adjustment]));
  const enabled = choice?.key === key ? choice.enabled : readArenaOverlayPreference(key) === 'open';
  function toggle() {
    notice.request(!enabled);
    setChoice({ key, enabled: !enabled });
    rememberArenaOverlayPreference(key, enabled ? 'closed' : 'open');
  }
  const supported = Boolean(arenaChartWindow(props.bars));
  const active = supported && enabled && Boolean(symbol);
  const data = useArenaPriceData(props.bars, owner, active);
  const report = useCallback((availability: ArenaAvailability) => {
    notice.report(availability);
    if (availability === 'empty') {
      rememberArenaOverlayPreference(key, 'closed');
      setChoice({ key, enabled: false });
    }
  }, [key, notice.report]);
  useEffect(() => { if (active) report(data.availability); }, [active, data.availability, report]);
  const overlay = useMemo(() => {
    if (!data.markers.length) return props.tradingOverlays;
    return { markers: [], lines: [], ...props.tradingOverlays, arenaMarkers: data.markers };
  }, [data.markers, props.tradingOverlays]);
  let hint: ReactNode = null;
  if (!supported) hint = <InfoTip label="模型模拟买卖点说明">模型点位按交易日记录，请切换日线、周线等日级周期查看。</InfoTip>;
  const modelToggle = symbol ? (
    <span className="inline-flex items-center gap-2"><Button type="button" size="sm" variant={active ? 'default' : 'outline'} className="justify-self-start" disabled={!supported} aria-pressed={active} aria-busy={active && data.availability === 'pending'} onClick={toggle}>
      模型模拟买卖点
    </Button>{hint}</span>
  ) : null;
  return (
    <div ref={notice.anchor} className="grid min-w-0 grid-cols-1 gap-3" data-market-chart-reference-region>
      <ArenaEmptyToast notice={notice} />
      {renderControls ? renderControls(modelToggle) : modelToggle}
      <ArenaSelection data={data} enabled={active} />
      {active && data.availability === 'error' ? <p>模拟点位读取失败</p> : null}
      <LightweightMarketChart {...props} tradingOverlays={overlay} onClick={(key) => {
        if (active) data.selectDay(key);
        props.onClick(key);
      }} />
    </div>
  );
}
function ArenaSelection({ data, enabled }: { data: ArenaPriceData; enabled: boolean }) {
  if (!enabled) return null;
  const matches = data.choices.map(match => ({ value: match.id, label: match.protocol.title }));
  const models = [{ value: 'all', label: '全部模型' }, ...(data.detail?.entrants ?? []).map(entrant => ({ value: entrant.id, label: entrant.model }))];
  const selected = models.some(model => model.value === data.state.entrant) ? data.state.entrant : 'all';
  return <div className="flex min-w-0 flex-wrap items-center gap-2 empty:hidden" data-arena-selection>
    {matches.length > 0 && <Select items={matches} value={data.active?.id ?? null} onValueChange={value => { if (value) data.selectMatch(value); }}>
      <SelectTrigger size="sm" aria-label="模型比赛" className="w-full sm:w-80"><SelectValue placeholder="选择比赛" /></SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}><SelectGroup>
        {matches.map(match => <SelectItem key={match.value} value={match.value}>{match.label}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>}
    {data.active && <Select items={models} value={selected} onValueChange={value => { if (value) data.selectEntrant(value === 'all' ? '' : value); }}>
      <SelectTrigger size="sm" aria-label="模型筛选" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}><SelectGroup>
        {models.map(model => <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>}
    {data.active && data.markers.length > 0 && <ArenaPointDetails data={data} />}
  </div>;
}
