import type { ReactNode } from 'react';
import { useMarketPeriodControls } from './MarketPeriodSelection.js';

export function MarketChartToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      className="flex min-w-0 max-w-full flex-none flex-col gap-1"
      data-market-chart-toolbar-group={label}
      role="group"
      aria-label={label}
    >
      <h5 className="m-0 text-xs font-medium text-muted-foreground">{label}</h5>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

export function MarketChartToolbar({
  chartControls,
  rangeControls,
  indicatorControls,
  viewControls,
}: {
  chartControls: ReactNode;
  rangeControls: ReactNode;
  indicatorControls: ReactNode;
  viewControls: ReactNode;
}) {
  const periodControls = useMarketPeriodControls();
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2" data-market-chart-toolbar>
      <MarketChartToolbarGroup label="图形">{chartControls}</MarketChartToolbarGroup>
      {periodControls ? <MarketChartToolbarGroup label="周期">{periodControls}</MarketChartToolbarGroup> : null}
      <MarketChartToolbarGroup label="区间">{rangeControls}</MarketChartToolbarGroup>
      <MarketChartToolbarGroup label="视图">{viewControls}</MarketChartToolbarGroup>
      <MarketChartToolbarGroup label="指标">{indicatorControls}</MarketChartToolbarGroup>
    </div>
  );
}
