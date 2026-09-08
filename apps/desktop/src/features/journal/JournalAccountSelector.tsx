import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';

export function JournalAccountSelector({
  accounts,
  value,
  onValueChange,
}: {
  accounts: Account[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const selectedAccount = accounts.find((account) => account.id === value);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 whitespace-nowrap text-sm font-medium">复盘账户</span>
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
    </div>
  );
}
