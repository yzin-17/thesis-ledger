import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function MarketChartChoiceControls({ options, quickValues, value, label, moreLabel, onValueChange }: {
  options: readonly { value: string; label: string }[];
  quickValues: readonly string[];
  value: string;
  label: string;
  moreLabel: string;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const quick = options.filter((item) => quickValues.includes(item.value));
  const extra = options.filter((item) => !quickValues.includes(item.value));
  const selectedExtra = extra.find((item) => item.value === value);
  const items = [{ value: '__more', label: '更多' }, ...extra];
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
    <ToggleGroup aria-label={`常用${label}`} value={[value]} onValueChange={(values) => {
      if (values[0]) onValueChange(values[0]);
    }}>
      {quick.map((item) => <ToggleGroupItem key={item.value} value={item.value}>{item.label}</ToggleGroupItem>)}
    </ToggleGroup>
    {extra.length > 0 && <Select items={items} value={selectedExtra?.value ?? '__more'} open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (details.reason === 'escape-key') details.event.stopPropagation();
      }}
      onValueChange={(next) => { if (next !== null && next !== '__more') onValueChange(next); }}>
      <SelectTrigger size="sm" className="w-auto min-w-20" aria-label={moreLabel}
        onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}>
        <SelectValue>{selectedExtra?.label ?? '更多'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>{extra.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>}
  </div>;
}
