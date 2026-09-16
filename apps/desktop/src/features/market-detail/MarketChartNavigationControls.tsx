import { ArrowLeftIcon, ArrowRightIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function MarketChartNavigationControls({
  onZoomIn,
  onZoomOut,
  onPanEarlier,
  onPanLater,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanEarlier: () => void;
  onPanLater: () => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-border bg-background px-0.5 shadow-xs"
      data-market-chart-navigation
      role="group"
      aria-label="图表导航"
    >
      <Button
        type="button"
        size="icon-sm"
        className="size-7"
        variant="ghost"
        aria-label="放大图表"
        title="放大图表"
        onClick={onZoomIn}
      >
        <ZoomInIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        className="size-7"
        variant="ghost"
        aria-label="缩小图表"
        title="缩小图表"
        onClick={onZoomOut}
      >
        <ZoomOutIcon aria-hidden="true" />
      </Button>
      <Separator orientation="vertical" className="mx-0 h-4" />
      <Button
        type="button"
        size="icon-sm"
        className="size-7"
        variant="ghost"
        aria-label="查看更早日期"
        title="查看更早日期"
        onClick={onPanEarlier}
      >
        <ArrowLeftIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        className="size-7"
        variant="ghost"
        aria-label="查看更晚日期"
        title="查看更晚日期"
        onClick={onPanLater}
      >
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
