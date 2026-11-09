import { useEffect, useMemo, useState } from 'react';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import type { MarketDetailPosition } from './market-detail.types.js';
import { fundNavCostReference } from './fund-nav-reference-model.js';
import { chartMeasurementActive, measureChartValues } from './chart-measurement-model.js';
import { chartOverlayHandlesEscape } from './market-chart-keyboard.js';

type Selection = { scope: string; cost: boolean; measuring: boolean; from: string | null; to: string | null; notice: string | null };
const initial = (scope: string): Selection => ({ scope, cost: false, measuring: false, from: null, to: null, notice: null });

export function useFundNavReferences(history: FundNavHistory, position?: MarketDetailPosition) {
  const scope = JSON.stringify([history[0]?.symbol, position?.accountId, position?.mode, position?.currency]);
  const [selection, setSelection] = useState(() => initial(scope));
  const state = selection.scope === scope ? selection : initial(scope);
  const measurementActive = chartMeasurementActive(state);
  const cost = fundNavCostReference(history, position);
  const points = useMemo(() => history.map((point) => ({ key: point.navDate.slice(0, 10), value: point.unitNav })), [history]);
  const measurement = useMemo(() => measureChartValues(points, state.from, state.to), [points, state.from, state.to]);
  const update = (change: Partial<Omit<Selection, 'scope'>>) => setSelection((current) => ({
    ...(current.scope === scope ? current : initial(scope)), ...change, scope,
  }));
  useEffect(() => {
    if (!measurementActive) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (chartOverlayHandlesEscape(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSelection((current) => ({ ...current, measuring: false, from: null, to: null, notice: null }));
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [measurementActive]);
  return {
    state, cost, measurement, measurementActive, canMeasure: points.length > 0,
    costPrice: state.cost ? cost.price : undefined,
    toggleCost: () => update({ cost: !state.cost }),
    toggleMeasurement: () => update({ measuring: !measurementActive, from: null, to: null, notice: null }),
    consumeClick: (key: string | null) => {
      if (!state.measuring) return false;
      if (!key || !points.some((point) => point.key === key)) {
        update({ notice: '所选日期没有正式净值，请选择有净值记录的日期。' });
        return true;
      }
      if (!state.from || state.to || !points.some((point) => point.key === state.from)) update({ from: key, to: null, notice: null });
      else update({ to: key, measuring: false, notice: null });
      return true;
    },
  };
}

export type FundNavReferences = ReturnType<typeof useFundNavReferences>;
