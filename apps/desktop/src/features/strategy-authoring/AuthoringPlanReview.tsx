import { authoringStrategyV6Schema, type BacktestStrategy } from '@thesis-ledger/schemas';
import {
  activeBacktestTradePlan,
  backtestTradePlanLines,
  backtestStrategyPlanReadback,
  isPriceResearchStrategyDefinition,
} from '@thesis-ledger/domain';

export function AuthoringPlanReview({
  beforeText,
  afterText,
  includeRules = false,
}: {
  beforeText: string;
  afterText: string;
  includeRules?: boolean;
}) {
  const plans = [
    { title: includeRules ? '原规则' : '原交易计划', text: beforeText },
    { title: includeRules ? '建议规则' : '建议交易计划', text: afterText },
  ].map(({ title, text }) => {
    const parsed = authoringStrategyV6Schema.safeParse(text);
    let lines: string[];
    if (!parsed.success) lines = ['计划配置无法读取，请检查原始定义。'];
    else if (includeRules) lines = backtestStrategyPlanReadback(parsed.data as BacktestStrategy);
    else if (activeBacktestTradePlan(parsed.data.tradePlan))
      lines = backtestTradePlanLines(
        parsed.data.tradePlan,
        isPriceResearchStrategyDefinition(parsed.data) ? '研究单位' : undefined,
        undefined,
        (parsed.data as BacktestStrategy).execution.timing === 'dailyBarOrders',
      );
    else lines = ['未配置交易计划，按普通入场、退出、仓位与独立风险配置执行。'];
    return { title, lines };
  });
  return (
    <div className="flex flex-col gap-4">
      {plans.map(({ title, lines }) => (
        <section key={title} className="flex min-w-0 flex-col gap-2">
          <h4 className="text-sm font-medium">{title}</h4>
          {lines.map((line) => (
            <p key={line} className="text-sm wrap-anywhere">
              {line}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
