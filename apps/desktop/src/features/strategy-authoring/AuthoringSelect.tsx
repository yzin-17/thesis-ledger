import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AuthoringSelect({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  disabled?: boolean;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '请选择';
  return (
    <Select
      value={value || null}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue className="min-w-0 truncate">{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
