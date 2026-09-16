import type { ReactNode } from 'react';

function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex min-w-max flex-none flex-col gap-1"
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
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3" data-market-chart-toolbar>
      <ToolbarGroup label="图形">{chartControls}</ToolbarGroup>
      <ToolbarGroup label="区间">{rangeControls}</ToolbarGroup>
      <ToolbarGroup label="指标">{indicatorControls}</ToolbarGroup>
      <ToolbarGroup label="视图">{viewControls}</ToolbarGroup>
    </div>
  );
}
