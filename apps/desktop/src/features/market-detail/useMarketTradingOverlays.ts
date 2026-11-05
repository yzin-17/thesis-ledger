import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { MarketChartBar } from './market-chart-types.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import {
  measureChartRange,
  overlayPriceScope,
  overlayTradingDate,
  placeTradeMarkers,
  type TradingOverlayModel,
} from './market-trading-overlay-model.js';

type Selection = {
  scope: string;
  trades: boolean;
  cost: boolean;
  risk: string;
  measuring: boolean;
  from: string | null;
  to: string | null;
};
const initial = (scope: string): Selection => ({
  scope,
  trades: false,
  cost: false,
  risk: '',
  measuring: false,
  from: null,
  to: null,
});
const reasons = {
  marker_budget_exceeded: '当前窗口成交超过叠加预算，请缩小图表窗口。',
  account_scope_unavailable: '当前账户与模式不匹配。',
  projection_inconsistent: '账本投影尚未一致，请稍后再查看。',
};

export function useMarketTradingOverlays(bars: MarketChartBar[], position?: MarketDetailPosition) {
  const scope = JSON.stringify([
    position?.accountId,
    position?.mode,
    bars[0]?.symbol,
    bars[0]?.timeframe,
    bars[0]?.adjustment,
  ]);
  const [selection, setSelection] = useState(() => initial(scope));
  const state = selection.scope === scope ? selection : initial(scope);
  const price = useMemo(() => overlayPriceScope(bars, position), [bars, position]);
  const start = bars[0]?.bucketStartDate ?? (bars[0] ? overlayTradingDate(bars[0]) : undefined);
  const end =
    bars.at(-1)?.bucketEndDate ?? (bars.at(-1) ? overlayTradingDate(bars.at(-1)!) : undefined);
  const canReadTrades = Boolean(
    price.comparable && position?.accountId && position.mode && start && end,
  );
  const query = useQuery({
    queryKey: [
      'desktop',
      'market-trade-chart',
      position?.accountId,
      position?.mode,
      bars[0]?.symbol,
      start,
      end,
    ],
    queryFn: ({ signal }) => {
      if (!position?.accountId || !position.mode || !start || !end)
        throw new Error('缺少账户和图表范围');
      return getDesktopApiClient().portfolio.getTradeChart(
        { accountId: position.accountId, mode: position.mode, symbol: position.symbol, start, end },
        signal,
      );
    },
    enabled: canReadTrades && state.trades,
    staleTime: 15_000,
    retry: false,
  });
  const update = (change: Partial<Selection>) =>
    setSelection((current) => ({
      ...(current.scope === scope ? current : initial(scope)),
      ...change,
      scope,
    }));
  const response =
    query.data?.version === 'trade-chart-v1' &&
    query.data.accountId === position?.accountId &&
    query.data.mode === position?.mode &&
    query.data.symbol === bars[0]?.symbol &&
    query.data.start === start &&
    query.data.end === end
      ? query.data
      : undefined;
  const placed = useMemo(() => {
    if (!state.trades || !price.comparable || !price.currency || response?.status !== 'ready')
      return { markers: [], omitted: 0 };
    return placeTradeMarkers(bars, response.markers, price.currency);
  }, [bars, state.trades, price.comparable, price.currency, response]);
  const risk = Number(state.risk);
  const riskInvalid = state.risk !== '' && (!Number.isFinite(risk) || risk <= 0 || risk >= 100);
  const measurement = useMemo(
    () => measureChartRange(bars, state.from, state.to),
    [bars, state.from, state.to],
  );
  const model = useMemo<TradingOverlayModel>(() => {
    const lines: TradingOverlayModel['lines'] = [];
    if (state.cost && price.cost !== undefined)
      lines.push({ price: price.cost, title: '当前持仓成本参考', kind: 'cost' });
    if (state.risk !== '' && !riskInvalid && price.cost !== undefined)
      lines.push({ price: price.cost * (1 - risk / 100), title: '手动止损参考', kind: 'risk' });
    return { markers: placed.markers, lines, measurement };
  }, [placed.markers, state.cost, state.risk, price.cost, risk, riskInvalid, measurement]);
  useEffect(() => {
    if (!state.measuring) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSelection((current) => ({ ...current, measuring: false, from: null, to: null }));
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [state.measuring]);
  let notice: string | undefined;
  if (state.trades && query.isPending) notice = '正在读取当前账户成交…';
  else if (state.trades && query.isError) notice = '成交读取失败，图表仍可查看。';
  else if (state.trades && response?.status === 'unavailable') notice = reasons[response.reason];
  else if (state.trades && response?.status === 'ready') {
    const omitted = placed.omitted + response.omittedCount;
    notice = `当前绘制${placed.markers.length}条成交`;
    if (omitted) notice += `；${omitted}条不具备当前坐标或时间条件，未绘制`;
    if (response.unplacedCount) notice += `；该证券另有${response.unplacedCount}条无日期成交`;
    notice += '。';
  }
  return {
    state,
    update,
    model,
    measurement,
    riskInvalid,
    notice,
    canReadTrades,
    canCost: price.cost !== undefined,
    comparable: price.comparable,
    consumeClick: (key: string | null) => {
      if (!state.measuring || !key) return false;
      if (!state.from || state.to) update({ from: key, to: null });
      else update({ to: key, measuring: false });
      return true;
    },
  };
}
export type MarketTradingOverlayState = ReturnType<typeof useMarketTradingOverlays>;
