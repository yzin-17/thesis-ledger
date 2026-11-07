import { useQuery } from '@tanstack/react-query';
import { riskMonitoringSourceText } from '@thesis-ledger/domain';
import { Fragment } from 'react';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy, QueryStatus, Section } from '../../components/MobilePrimitives';

export function RiskMonitoringSchedule({ enabledRules }: { enabledRules: number | null }) {
  const { api, scope } = useMobileRuntime();
  const state = useQuery({
    queryKey: [...scope, 'risk-automatic-monitoring'],
    queryFn: ({ signal }) => api.risk.monitoring(signal),
    retry: false,
    refetchInterval: 15_000,
  });
  return (
    <Section title="风险规则自动监控">
      <QueryStatus query={state} retry={() => void state.refetch()} />
      <Copy>
        {enabledRules === null ? '规则状态待核对' : `已启用 ${enabledRules} 条风险规则`} ·
        生效后自动参与，无需另开扫描
      </Copy>
      {state.data && (
        <>
          <Copy>
            {state.data.processorAvailable ? '自动消费已有行情更新' : '监控处理暂不可用，等待恢复'}{' '}
            · {state.data.eligibleRules} 条规则已生效
          </Copy>
          {state.data.futureRules > 0 && <Copy>{state.data.futureRules} 条规则等待生效</Copy>}
          {state.data.unsupportedRules > 0 && (
            <Copy>
              {state.data.unsupportedRules} 条规则尚缺可自动消费的指标、正式净值或已完成 K 线数据
            </Copy>
          )}
          <Copy>{state.data.limitation}</Copy>
          {state.data.eligibleRules > 0 && !state.data.acquisitionAvailable && (
            <Copy>行情需求处理暂不可用，等待恢复</Copy>
          )}
          {state.data.sources.map((source) => (
            <Fragment key={source.symbol}>
              <Copy>{riskMonitoringSourceText(source)}</Copy>
              {source.sourceTime && (
                <Copy>
                  来源时间 {new Date(source.sourceTime).toLocaleString()}
                  {source.fetchedAt && ` · 获取时间 ${new Date(source.fetchedAt).toLocaleString()}`}
                </Copy>
              )}
              {source.nextAttemptAt && (
                <Copy>最早下次获取 {new Date(source.nextAttemptAt).toLocaleString()}</Copy>
              )}
            </Fragment>
          ))}
          {state.data.evaluatedAt && (
            <Copy>
              最近评估 {new Date(state.data.evaluatedAt).toLocaleString()} ·{' '}
              {state.data.missingPrices} 个对象缺价 · {state.data.delayedPrices} 个对象使用延迟数据
            </Copy>
          )}
          {state.data.gapAt && <Copy>行情更新记录曾中断，间断期间的价格变化无法回溯。</Copy>}
          {state.data.inputUnavailable > 0 && (
            <Copy>
              {state.data.inputUnavailable} 项评估缺少输入：{state.data.inputReason}
            </Copy>
          )}
          {state.data.error && <Copy>{state.data.error}</Copy>}
        </>
      )}
      <Copy>已有定时任务可在自动化设置中管理；通知沿用原设置，模拟组合仅记录事件。</Copy>
    </Section>
  );
}
