import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MarketChartOptionsV3, MarketChartPlanV3 } from '@thesis-ledger/schemas';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { ChartAdjustment } from './useMarketChartSelection.js';

export const chartAdjustmentLabels = { none: '不复权', qfq: '前复权', hfq: '后复权' } as const;
export const chartAdjustmentReason: Record<
  NonNullable<MarketChartOptionsV3['options'][number]['reason']>,
  string
> = {
  not_adapted: '暂未接入',
  unsupported_adjustment: '来源不支持此口径',
  credential_missing: '尚未配置凭据',
  not_admitted: '尚未完成来源准入',
  admission_invalid: '来源准入已失效',
  admission_not_yet_valid: '来源准入尚未生效',
  admission_expired: '来源准入已过期',
  quota_unavailable: '来源额度不可用',
  insufficient_coverage: '数据覆盖不足',
  upstream_failure: '来源暂时不可用',
  basis_incompatible: '价格基准不兼容',
  policy_not_applied: '路由配置尚未生效',
  disabled: '行情路由已禁用',
  route_not_configured: '尚未配置此口径路由',
  catalog_unavailable: '能力目录暂时不可用',
};

export function MarketChartAdjustment({
  symbol,
  value = 'qfq',
  onChange,
  plan,
  refreshSequence = 0,
}: {
  symbol: string;
  value?: ChartAdjustment | undefined;
  plan?: MarketChartPlanV3 | undefined;
  refreshSequence?: number;
  onChange: (value: ChartAdjustment) => void;
}) {
  const query = useQuery({
    queryKey: ['desktop', 'market-chart-options', symbol, plan ?? null, refreshSequence],
    queryFn: ({ signal }) =>
      plan
        ? getDesktopApiClient().market.getPlannedChartOptions(symbol, plan, signal)
        : getDesktopApiClient().market.getChartOptions(symbol, signal),
    staleTime: 15_000,
    retry: false,
    refetchOnMount: 'always',
  });
  const data = query.data?.symbol === symbol && !query.isFetching ? query.data : undefined;
  useEffect(() => {
    if (data?.mode === 'v3') onChange(value);
  }, [data?.mode, value, onChange]);
  const selected = data?.options.find((option) => option.adjustment === value);
  let notice = '';
  if (query.isError) notice = '口径状态读取失败';
  else if (!data) notice = '正在读取口径状态';
  else if (selected?.reason) notice = chartAdjustmentReason[selected.reason];
  else if (selected?.availableVia === 'backup') notice = '当前窗口可使用备用来源';
  const items = Object.entries(chartAdjustmentLabels).map(([itemValue, label]) => ({
    value: itemValue,
    label,
  }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          const option = data?.options.find((item) => item.adjustment === next);
          if (!query.isError && data?.mode === 'v3' && option?.available)
            onChange(option.adjustment);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="图表价格口径"
          disabled={query.isError || !data || data.mode !== 'v3'}
        >
          <SelectValue>{chartAdjustmentLabels[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {data?.options.map((option) => (
              <SelectItem
                key={option.adjustment}
                value={option.adjustment}
                disabled={!option.available}
              >
                {chartAdjustmentLabels[option.adjustment]}
                {option.reason ? ` · ${chartAdjustmentReason[option.reason]}` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {notice ? <span className="text-xs text-muted-foreground">{notice}</span> : null}
    </div>
  );
}
