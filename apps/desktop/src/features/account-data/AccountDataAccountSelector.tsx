import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AccountDataAccountSelector({
  accounts,
  accountId,
  onSelectAccount,
  onManageAccounts,
}: {
  accounts: Account[];
  accountId: string;
  onSelectAccount: (accountId: string) => void | Promise<unknown>;
  onManageAccounts?: () => void;
}) {
  const allAccountsSelected = accountId === 'all';
  let accountSelectionLabel = '选择账户';
  if (allAccountsSelected) accountSelectionLabel = '全部账户';
  else {
    const selectedAccount = accounts.find((account) => account.id === accountId);
    if (selectedAccount) accountSelectionLabel = accountDisplayLabel(selectedAccount);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Field className="min-w-0 flex-1 sm:flex-row sm:items-center sm:gap-3">
        <FieldLabel htmlFor="account-data-account" className="shrink-0 whitespace-nowrap">
          当前账户
        </FieldLabel>
        <Select
          value={accountId || null}
          onValueChange={(value) => {
            if (value) void onSelectAccount(value);
          }}
        >
          <SelectTrigger id="account-data-account" className="w-full">
            <SelectValue placeholder="选择账户">{accountSelectionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部账户</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {accountDisplayLabel(account)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {!allAccountsSelected && onManageAccounts && (
        <div className="flex shrink-0">
          <Button type="button" variant="outline" onClick={onManageAccounts}>
            管理账户
          </Button>
        </div>
      )}
    </div>
  );
}
