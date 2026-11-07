import { defaultIntervals, intervalsByRange } from './performance-series-selection.js';
import { useId } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  PerformanceSeriesInterval,
  PerformanceSeriesRange,
  PerformanceSeriesResponse,
  PortfolioMode,
} from './performance.types.js';

const rangeOptions: Array<{ value: PerformanceSeriesRange; label: string }> = [
  { value: '1D', label: '1日' },
  { value: '5D', label: '5日' },
  { value: '1M', label: '近1月' },
  { value: '3M', label: '近3月' },
  { value: 'YTD', label: '年初至今' },
  { value: '1Y', label: '近1年' },
  { value: '5Y', label: '近5年' },
  { value: 'ALL', label: '全部' },
];
const intervalOptions: Array<{ value: PerformanceSeriesInterval; label: string }> = [
  { value: '1min', label: '分线' },
  { value: '1h', label: '时线' },
  { value: '1d', label: '日线' },
  { value: '1w', label: '周线' },
  { value: '1mo', label: '月线' },
  { value: '1y', label: '年线' },
];
export function PerformanceTrendControls({
  range,
  mode = 'actual',
  interval,
  series,
  onRangeChange,
  onIntervalChange,
}: {
  range: PerformanceSeriesRange;
  mode?: PortfolioMode;
  interval: PerformanceSeriesInterval;
  series?: PerformanceSeriesResponse | undefined;
  onRangeChange: (range: PerformanceSeriesRange, interval: PerformanceSeriesInterval) => void;
  onIntervalChange: (interval: PerformanceSeriesInterval) => void;
}) {
  const hintId = useId();
  const available = intervalsByRange[range].filter(
    (value) =>
      (mode === 'actual' || !['1min', '1h'].includes(value)) &&
      (series?.range !== range || series.availableIntervals.includes(value)),
  );
  return (
    <div className="flex max-w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={range}
          onValueChange={(value) => {
            if (!value) return;
            let nextInterval = interval;
            if (!intervalsByRange[value].includes(interval)) nextInterval = defaultIntervals[value];
            if (mode === 'shadow' && ['1min', '1h'].includes(nextInterval)) nextInterval = '1d';
            onRangeChange(value, nextInterval);
          }}
        >
          <SelectTrigger className="w-32" aria-label="走势区间">
            <SelectValue>
              {rangeOptions.find((option) => option.value === range)?.label ?? '区间'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {rangeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={mode === 'shadow' && option.value === '1D'}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={interval} onValueChange={(value) => value && onIntervalChange(value)}>
          <SelectTrigger className="w-28" aria-label="走势粒度" aria-describedby={hintId}>
            <SelectValue>
              {intervalOptions.find((option) => option.value === interval)?.label ?? '粒度'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {intervalOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={!available.includes(option.value)}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <p id={hintId} className="m-0 max-w-80 text-xs text-muted-foreground">
        {mode === 'shadow'
          ? '模拟账户仅支持日线及更长周期。'
          : '分线支持 1日、5日；时线支持 1日、5日、近1月、近3月。盘中数据来自已记录的估值采样。'}
      </p>
    </div>
  );
}
