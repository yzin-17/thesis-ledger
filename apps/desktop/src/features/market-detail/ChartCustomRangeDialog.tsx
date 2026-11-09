import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { isChartDateRange, type ChartDateRange } from './chart-date-range.js';

export function ChartCustomRangeDialog({ initial, maximum, onApply, onClose }: {
  initial: ChartDateRange;
  maximum: string;
  onApply: (range: ChartDateRange) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent data-chart-custom-range className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>自定义区间</DialogTitle>
        <DialogDescription>选择起止日期，包含开始和结束当天。</DialogDescription>
      </DialogHeader>
      <form noValidate className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault();
        if (!isChartDateRange(draft)) { setError('请输入有效日期，开始日期不能晚于结束日期。'); return; }
        if (draft.to > maximum) { setError('结束日期不能晚于今天。'); return; }
        onApply(draft);
        onClose();
      }}>
        <FieldGroup className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>开始日期</FieldLabel>
            <DateInput type="date" aria-label="开始日期" max={maximum} value={draft.from}
              onChange={(event) => { setDraft({ ...draft, from: event.target.value }); setError(''); }} />
          </Field>
          <Field>
            <FieldLabel>结束日期</FieldLabel>
            <DateInput type="date" aria-label="结束日期" max={maximum} value={draft.to}
              onChange={(event) => { setDraft({ ...draft, to: event.target.value }); setError(''); }} />
          </Field>
        </FieldGroup>
        {error && <p className="m-0 text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit">应用区间</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
