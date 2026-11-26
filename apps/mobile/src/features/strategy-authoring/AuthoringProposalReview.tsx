import {
  authoringStrategyV6Schema,
  type AuthoringProposalInput,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import {
  activeBacktestTradePlan,
  backtestTradePlanLines,
  backtestStrategyPlanReadback,
  isPriceResearchStrategyDefinition,
} from '@thesis-ledger/domain';
import { Action, Copy, ContentSection } from '../../components/MobilePrimitives';

type Props = {
  payload: Pick<
    AuthoringProposalInput,
    'allowedPaths' | 'beforeText' | 'afterText' | 'differences'
  >;
  canApply: boolean;
  canDiscard: boolean;
  onApply: () => void;
  onDiscard: () => void;
};
export function AuthoringProposalReview({
  payload,
  canApply,
  canDiscard,
  onApply,
  onDiscard,
}: Props) {
  const includeRules = payload.allowedPaths.some((path) => ['entry', 'exit', 'execution'].includes(path.split('.')[0]!));
  const showReadback = includeRules || payload.allowedPaths.includes('tradePlan');
  return (
    <ContentSection {...(showReadback ? {} : { title: '修改差异' })}>
      {showReadback ? (
        <PlanReview
          beforeText={payload.beforeText}
          afterText={payload.afterText}
          includeRules={includeRules}
        />
      ) : (
        <Copy>{JSON.stringify(payload.differences, null, 2)}</Copy>
      )}
      <Action label="确认采用修改建议" disabled={!canApply} onPress={onApply} />
      <Action label="丢弃修改建议" disabled={!canDiscard} onPress={onDiscard} />
    </ContentSection>
  );
}

function PlanReview({
  beforeText,
  afterText,
  includeRules,
}: {
  beforeText: string;
  afterText: string;
  includeRules: boolean;
}) {
  const plans = [
    { title: includeRules ? '原规则' : '原交易计划', text: beforeText },
    { title: includeRules ? '建议规则' : '建议交易计划', text: afterText },
  ];
  return (
    <>
      {plans.map(({ title, text }) => {
        const parsed = authoringStrategyV6Schema.safeParse(text);
        let lines: string[];
        if (!parsed.success) lines = ['计划配置无法读取，请检查原始定义。'];
        else if (includeRules)
          lines = backtestStrategyPlanReadback(parsed.data as BacktestStrategy);
        else if (activeBacktestTradePlan(parsed.data.tradePlan))
          lines = backtestTradePlanLines(
            parsed.data.tradePlan,
            isPriceResearchStrategyDefinition(parsed.data) ? '研究单位' : undefined,
            undefined,
            (parsed.data as BacktestStrategy).execution.timing === 'dailyBarOrders',
          );
        else lines = ['未配置交易计划，按普通入场、退出、仓位与独立风险配置执行。'];
        return (
          <ContentSection key={title} title={title}>
            {lines.map((line) => (
              <Copy key={line}>{line}</Copy>
            ))}
          </ContentSection>
        );
      })}
    </>
  );
}
