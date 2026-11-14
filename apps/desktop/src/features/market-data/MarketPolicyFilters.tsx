import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { assetTypeLabel, marketLabel } from './market-data-routes-v3.js';
import type { MarketPolicyFilter } from './market-policy-route-groups-v3.js';

export function MarketPolicyChoice({
  label,
  value,
  items,
  onChange,
  className,
  compact = false,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string | null;
  items: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel className={compact ? 'sr-only max-sm:not-sr-only' : undefined}>
        {label}
      </FieldLabel>
      <Select
        disabled={disabled}
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next && !items.find((item) => item.value === next)?.disabled) onChange(next);
        }}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function MarketPolicyFilters({
  filter,
  onChange,
}: {
  filter: MarketPolicyFilter;
  onChange: (filter: MarketPolicyFilter) => void;
}) {
  return (
    <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_200px_minmax(0,1fr)]">
      <MarketPolicyChoice
        label="市场"
        value={filter.market}
        items={[
          { value: 'all', label: '全部市场' },
          ...Object.entries(marketLabel).map(([value, label]) => ({ value, label })),
        ]}
        onChange={(market) => onChange({ ...filter, market })}
      />
      <MarketPolicyChoice
        label="标的类型"
        value={filter.assetType}
        items={[
          { value: 'all', label: '全部类型' },
          ...Object.entries(assetTypeLabel).map(([value, label]) => ({ value, label })),
        ]}
        onChange={(assetType) => onChange({ ...filter, assetType })}
      />
      <Field className="sm:col-span-2 xl:col-span-1">
        <FieldLabel>搜索能力</FieldLabel>
        <Input
          aria-label="搜索能力"
          placeholder="例如：净值、财务报表、风险警示"
          value={filter.search}
          onChange={(event) => onChange({ ...filter, search: event.target.value })}
        />
      </Field>
    </FieldGroup>
  );
}
