import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';

export function JournalAccountSelector({
  accounts,
  value,
  onValueChange,
  layout = 'inline',
}: {
  accounts: Account[];
  value: string;
  onValueChange: (value: string) => void;
  layout?: 'inline' | 'stacked';
}) {
  const selectedAccount = accounts.find((account) => account.id === value);
  return (
    <Field className={cn('min-w-0 flex-1', layout === 'inline' && 'sm:flex-row sm:items-center sm:gap-3')}>
      <FieldLabel className="shrink-0 whitespace-nowrap">复盘账户</FieldLabel>
      <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
        <SelectTrigger aria-label="复盘账户" className="w-full">
          <SelectValue placeholder="选择账户">
            {selectedAccount ? accountDisplayLabel(selectedAccount) : '选择账户'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountDisplayLabel(account)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
