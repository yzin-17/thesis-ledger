import { Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';

export function MarketDetailRefreshControls({
  refreshing,
  onRefresh,
  automatic,
  onAutomaticChange,
  minute,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  automatic: boolean;
  onAutomaticChange: (value: boolean) => void;
  minute: boolean;
}) {
  const automaticLabel = automatic ? '关闭自动刷新' : '开启自动刷新';
  const automaticHint = minute
    ? `${automaticLabel}（盘中每 60 秒同步行情）`
    : `${automaticLabel}（切换分钟周期后盘中同步行情）`;
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="行情刷新操作">
      <RefreshIconButton label="刷新行情" refreshing={refreshing} onClick={onRefresh} />
      <Button
        type="button"
        size="icon-sm"
        variant={automatic ? 'secondary' : 'ghost'}
        aria-label={automaticLabel}
        title={automaticHint}
        aria-pressed={automatic}
        onClick={() => onAutomaticChange(!automatic)}
      >
        <Repeat2 aria-hidden="true" />
      </Button>
    </div>
  );
}
