import { compileStrategyMonitoringPlan } from '@thesis-ledger/domain';
import { strategySchema } from './backtest-strategy.js';

/** 按真实风险规则的可转换能力判断，入场、离场和研究价格均不转为账户监控。 */
export function strategyRiskVersionEligibility(version: {
  version: number;
  schemaVersion?: number | undefined;
  schema?: unknown;
}): { eligible: boolean; reason?: string } {
  if (version.version <= 0) return { eligible: false, reason: '风险应用需要正式版本' };
  const parsed = strategySchema.safeParse(version.schema);
  if (!parsed.success || 1 !== version.schemaVersion)
    return { eligible: false, reason: '定义无效或与存储协议不一致' };
  const plan = compileStrategyMonitoringPlan(parsed.data, 'eligibility');
  const unsupported = plan.coverage.items.filter(
    (item) => item.category === 'risk' && item.status === 'unsupported',
  );
  if (unsupported.length)
    return {
      eligible: false,
      reason: unsupported.map((item) => `${item.source}：${item.reason}`).join('；'),
    };
  return { eligible: true };
}
