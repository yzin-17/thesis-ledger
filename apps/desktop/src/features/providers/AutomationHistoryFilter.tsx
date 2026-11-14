import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AutomationJob } from './providers.types.js';

export function AutomationHistoryFilter({
  jobs,
  jobId,
  onChange,
}: {
  jobs: AutomationJob[];
  jobId: string | undefined;
  onChange: (jobId: string | undefined) => void;
}) {
  const items = [
    { value: 'all', label: '全部任务' },
    ...jobs.map((job) => ({ value: job.id, label: job.name })),
  ];
  const selected = items.find((item) => item.value === (jobId ?? 'all'));
  return (
    <Field className="mb-3 flex-row flex-wrap items-center gap-2">
      <FieldLabel>任务</FieldLabel>
      <Select
        items={items}
        value={jobId ?? 'all'}
        onValueChange={(value) => onChange(value && value !== 'all' ? value : undefined)}
      >
        <SelectTrigger aria-label="任务" className="w-64 max-w-full">
          <SelectValue>{selected?.label ?? '所选任务'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
