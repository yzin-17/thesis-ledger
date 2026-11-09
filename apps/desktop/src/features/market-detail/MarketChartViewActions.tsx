import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { MarketChartNavigationControls } from './MarketChartNavigationControls.js';
import type { ChartViewAction } from './market-chart-viewport-controller.js';

export function MarketChartViewActions({ onLatest, onReset, expanded, onToggleExpanded, fullscreenTrigger, onNavigate }: {
  onLatest: () => void;
  onReset: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  fullscreenTrigger?: Ref<HTMLButtonElement> | undefined;
  onNavigate: (type: ChartViewAction['type']) => void;
}) {
  return <>
    <Button type="button" size="sm" variant="outline" onClick={onLatest}>回到最新</Button>
    <Button type="button" size="sm" variant="outline" onClick={onReset}>重置</Button>
    <div className="flex items-center gap-2">
      <Button ref={expanded ? undefined : fullscreenTrigger} type="button" size="sm" variant="outline" onClick={onToggleExpanded}>
        {expanded ? '退出全屏' : '全屏'}
      </Button>
      <MarketChartNavigationControls onZoomIn={() => onNavigate('zoomIn')} onZoomOut={() => onNavigate('zoomOut')}
        onPanEarlier={() => onNavigate('panEarlier')} onPanLater={() => onNavigate('panLater')} />
    </div>
  </>;
}
