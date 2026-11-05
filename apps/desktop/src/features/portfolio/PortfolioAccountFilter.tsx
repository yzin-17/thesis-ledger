import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountDisplayLabel, type Account, type PortfolioMode } from './portfolio.types.js';

export function PortfolioAccountFilter({
  accounts,
  mode,
  accountId,
  onAccountChange,
  label = '投资组合账户范围',
}: {
  accounts: Account[];
  mode: PortfolioMode;
  accountId: string;
  onAccountChange: (accountId: string) => void;
  label?: string;
}) {
  const options = [
    { value: 'all', label: '全部账户' },
    ...accounts
      .filter((account) => account.mode === mode && account.active !== false)
      .map((account) => ({ value: account.id, label: accountDisplayLabel(account) })),
  ];
  const selection = options.find((option) => option.value === accountId) ?? options[0]!;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">账户范围</span>
      <Select
        value={selection.value}
        onValueChange={(value) => {
          if (value) onAccountChange(value === 'all' ? '' : value);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full sm:w-80">
          <SelectValue>{selection.label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
