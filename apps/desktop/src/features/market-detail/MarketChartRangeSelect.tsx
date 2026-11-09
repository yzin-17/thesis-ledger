import { useState } from 'react';
import { MarketChartChoiceControls } from './MarketChartChoiceControls.js';
import { chartDateInterval, chartMarketDate, chartRangeOptions, type ChartRange } from './chart-date-range.js';
import { ChartCustomRangeDialog } from './ChartCustomRangeDialog.js';
import { Button } from '@/components/ui/button';

export function MarketChartRangeSelect({ value, anchorDate, symbol, onValueChange }: {
  value: ChartRange;
  timeframe?: string | undefined;
  anchorDate?: string | undefined;
  symbol?: string | undefined;
  onValueChange: (range: ChartRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const maximum = chartMarketDate(new Date().toISOString(), symbol);
  const items = [...chartRangeOptions.map((option) => ({ ...option, value: String(option.value) })),
    { value: 'custom', label: '自定义区间' }];
  const selected = typeof value === 'number' ? String(value) : 'custom';
  return (
    <>
    <MarketChartChoiceControls label="行情区间" moreLabel="更多区间" options={items} quickValues={['1', '30', '365']}
      value={selected} onValueChange={(next) => {
        if (next === 'custom') setCustomOpen(true);
        else onValueChange(Number(next));
      }} />
    {typeof value !== 'number' && <Button type="button" size="sm" variant="ghost" onClick={() => setCustomOpen(true)}>编辑日期</Button>}
    {customOpen && <ChartCustomRangeDialog
      initial={chartDateInterval(value, anchorDate ?? maximum) ?? { from: maximum, to: maximum }}
      maximum={maximum} onApply={onValueChange} onClose={() => setCustomOpen(false)} />}
    </>
  );
}
