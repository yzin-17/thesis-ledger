import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { riskKeys } from './risk.queries.js';

type MonitoringStatus = Awaited<ReturnType<ReturnType<typeof getDesktopApiClient>['risk']['monitoring']>>;

function monitoringSummary(status: MonitoringStatus): string {
  if (!status.eligibleRules) {
    if (status.futureRules) return `${status.futureRules} 条规则待生效`;
    return '暂无生效规则';
  }
  if (status.error || !status.processorAvailable) return '监控暂不可用';
  if (status.inputUnavailable) return status.inputReason || '部分规则缺少评估数据';
  if (status.unsupportedRules) return `${status.unsupportedRules} 条规则缺少所需指标，暂不能评估`;
  if (!status.acquisitionAvailable || status.sources.some((source) => source.acquisition === 'blocked')) {
    return '行情获取受限，仅按已有数据评估';
  }
  if (status.missingPrices) return '部分标的缺少价格，暂不能评估';
  if (status.delayedPrices) return '部分标的使用延迟行情';
  return `${status.eligibleRules} 条生效规则随行情更新评估`;
}

export function RiskMonitoringSchedule({ enabledRules, onOpenRules }: {
  enabledRules: number | null;
  onOpenRules: () => void;
}) {
  const state = useQuery({
    queryKey: [...riskKeys.root, 'automatic-monitoring'],
    queryFn: ({ signal }) => getDesktopApiClient().risk.monitoring(signal),
    enabled: enabledRules !== 0,
    retry: false,
    refetchInterval: 15_000,
  });
  let summary = '正在读取监控状态';
  if (enabledRules === 0) summary = '尚未启用规则';
  else if (state.isError) summary = '监控状态读取失败';
  else if (state.data) summary = monitoringSummary(state.data);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="自动监控">
      <span className="text-muted-foreground">自动监控</span>
      <span>{summary}</span>
      {enabledRules === 0 && (
        <Button type="button" variant="link" size="xs" onClick={onOpenRules}>查看规则</Button>
      )}
      {enabledRules !== 0 && state.isError && (
        <Button type="button" variant="link" size="xs" disabled={state.isFetching} onClick={() => void state.refetch()}>重试</Button>
      )}
    </div>
  );
}
