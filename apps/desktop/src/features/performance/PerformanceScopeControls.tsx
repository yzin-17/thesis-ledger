import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';
import type { PerformanceFxMeta, PortfolioMode } from './performance.types.js';
import { formatDate } from './performance-display.js';

const ALL_ACCOUNTS_VALUE = '__all_accounts__';

export function PerformanceAccountSelector({
  accounts,
  mode,
  accountId,
  mixedCurrencies,
  latestSnapshotAt,
  valuedAt,
  onAccountChange,
  fxMerge,
  baseCurrency,
  onFxMergeChange,
  onBaseCurrencyChange,
  onRetry,
  fx,
  showAccountSelector = true,
  accountControl,
}: {
  showAccountSelector?: boolean;
  accountControl?: ReactNode;
  accounts: Account[];
  mode: PortfolioMode;
  accountId: string;
  mixedCurrencies: boolean;
  latestSnapshotAt?: string | undefined;
  valuedAt?: string | undefined;
  onAccountChange: (accountId: string) => void;
  fxMerge?: boolean;
  baseCurrency?: 'CNY' | 'HKD' | 'USD';
  onFxMergeChange?: (checked: boolean) => void;
  onBaseCurrencyChange?: (currency: 'CNY' | 'HKD' | 'USD') => void;
  onRetry?: (() => void) | undefined;
  fx?: PerformanceFxMeta | undefined;
}) {
  const resolvedFxMerge = fxMerge ?? false;
  const resolvedBaseCurrency = baseCurrency ?? 'CNY';
  const handleFxMergeChange = onFxMergeChange ?? (() => undefined);
  const handleBaseCurrencyChange = onBaseCurrencyChange ?? (() => undefined);
  const fxAvailable = mixedCurrencies && !accountId;
  const modeAccounts = accounts.filter(
    (account) => account.mode === mode && account.active !== false,
  );
  const selectedAccount = modeAccounts.find((account) => account.id === accountId);
  const status = performanceScopeStatus(
    valuedAt,
    latestSnapshotAt,
    fx,
    fxAvailable,
    resolvedFxMerge,
    resolvedBaseCurrency,
  );
  // 状态信息与控制项同一行：宽屏右对齐，窄屏才换行，避免工具栏下方再留一整行空白。
  // 页头/工具栏到页签统一沿用页面的 24px 分组间距，与账户数据、自选、市场数据页一致。
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {accountControl && <div className="min-w-0 basis-full sm:basis-auto">{accountControl}</div>}
        {showAccountSelector && (
          <div className="flex min-w-0 basis-full items-center gap-2 text-sm text-muted-foreground sm:basis-auto">
            <span className="shrink-0">账户</span>
            <Select
              value={accountId || ALL_ACCOUNTS_VALUE}
              onValueChange={(value) => {
                onAccountChange(value === ALL_ACCOUNTS_VALUE ? '' : (value ?? ''));
              }}
            >
              <SelectTrigger aria-label="账户" className="w-full sm:w-72">
                <SelectValue>
                  {selectedAccount ? accountDisplayLabel(selectedAccount) : '全部账户'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_ACCOUNTS_VALUE}>全部账户</SelectItem>
                  {modeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {accountDisplayLabel(account)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>汇率合并</span>
          <Switch
            variant="risk"
            checked={resolvedFxMerge}
            disabled={!fxAvailable}
            aria-label={fxAvailable ? '汇率合并' : '当前范围无需汇率换算'}
            onCheckedChange={handleFxMergeChange}
          >
            <SwitchThumb variant="risk" aria-hidden="true" />
          </Switch>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>基准币种</span>
          <Select
            value={resolvedBaseCurrency}
            disabled={!fxAvailable || !resolvedFxMerge}
            onValueChange={(value) => {
              if (value === 'CNY' || value === 'HKD' || value === 'USD')
                handleBaseCurrencyChange(value);
            }}
          >
            <SelectTrigger aria-label="基准币种" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="CNY">CNY</SelectItem>
                <SelectItem value="HKD">HKD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
        {status && <p className="m-0">{status}</p>}
        {fxAvailable && resolvedFxMerge && fx?.status === 'blocked' && onRetry ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-7 px-0 text-xs"
            onClick={onRetry}
          >
            重新获取汇率
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function performanceScopeStatus(
  valuedAt: string | undefined,
  latestSnapshotAt: string | undefined,
  fx: PerformanceFxMeta | undefined,
  fxAvailable: boolean,
  resolvedFxMerge: boolean,
  resolvedBaseCurrency: 'CNY' | 'HKD' | 'USD',
) {
  const statusLabel = [
    valuedAt ? `估值计算时间 ${formatDate(valuedAt)}` : undefined,
    latestSnapshotAt && latestSnapshotAt !== valuedAt
      ? `收益快照 ${formatDate(latestSnapshotAt)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const fxDate = fx?.asOf ? formatDate(fx.asOf) : undefined;
  let fxStatusLabel = '';
  if (fxAvailable && !resolvedFxMerge) fxStatusLabel = '分币种显示';
  else if (fx?.status === 'ready') fxStatusLabel = `已换算至 ${resolvedBaseCurrency}`;
  else if (fx?.status === 'stale') fxStatusLabel = `已换算至 ${resolvedBaseCurrency} · 汇率陈旧`;
  else if (fx?.status === 'blocked') fxStatusLabel = '汇率不可用 · 保留原币种';
  const status = [
    fxStatusLabel,
    fxDate ? `汇率截至 ${fxDate}` : undefined,
    resolvedFxMerge && fx?.estimated ? '当前汇率回算 · 估算' : undefined,
    statusLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return status;
}
