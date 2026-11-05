import type { ReactNode } from 'react';
import { useMarketPeriodControls } from './MarketPeriodSelection.js';

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
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
      <ToolbarGroup label="图形">{chartControls}</ToolbarGroup>
      {periodControls ? <ToolbarGroup label="周期">{periodControls}</ToolbarGroup> : null}
      <ToolbarGroup label="视图">{viewControls}</ToolbarGroup>
      <details className="basis-full text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground">区间与指标</summary>
        <div className="mt-3 flex flex-wrap gap-4">
          <ToolbarGroup label="区间">{rangeControls}</ToolbarGroup>
          <ToolbarGroup label="指标">{indicatorControls}</ToolbarGroup>
        </div>
      </details>
    </div>
  );
}
