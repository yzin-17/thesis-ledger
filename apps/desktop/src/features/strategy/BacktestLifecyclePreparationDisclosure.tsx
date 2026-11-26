import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateOnly } from '@/lib/date-display';
import { lifecycleEvidenceSources } from './backtest-lifecycle-preparation-diagnostics.js';

const lifecycleSourceLabels: Record<string, string> = {
  DAILY_TRADING_STATUS: '日级交易状态',
  SECURITY_BASIC_DATES: '证券基础日期',
};

export function BacktestLifecyclePreparationDisclosure({ config }: { config: unknown }) {
  const parsed = runConfigSchemaV3.safeParse(config);
  if (!parsed.success || !parsed.data.lifecyclePreparation) return null;
  const run = parsed.data;
  const life = run.lifecyclePreparation!;
  const sources = lifecycleEvidenceSources(life.response);
  return (
    <Alert>
      <AlertTitle>生命周期感知的预热研究</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          请求区间：{formatDateOnly(run.startDate)} 至 {formatDateOnly(run.endDate)}；实际信号起点：
          {formatDateOnly(life.signalStartDate)}。
        </p>
        <p>
          原策略需 {life.requiredWarmupBars} 个真实预热
          Bar；上市前不交易，上市后积累足够真实行情再计算信号，成交沿用原时序。策略与基准采用同一可比较起点。
        </p>
        <p>
          生命周期范围外、已知停牌与来源缺失分别处理；未知上市日不从价格首行推断。基础日期与价格保留独立来源及冻结输入，不新增清仓或摘牌后估值规则。
        </p>
        <p>
          生命周期来源：
          {sources.map(({ capability, providerId, upstreamSource }) => {
            const label = lifecycleSourceLabels[capability];
            return `${label ? `${label} ` : ''}${providerId} / ${upstreamSource}`;
          }).join('、')}
          ；冻结协议：{life.version}。
        </p>
      </AlertDescription>
    </Alert>
  );
}
