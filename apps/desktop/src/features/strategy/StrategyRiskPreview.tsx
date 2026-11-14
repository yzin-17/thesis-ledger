import type { ReactNode } from 'react';
import { formatDecimalRatioPercent } from '@thesis-ledger/domain';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { RiskApplicationPreview } from './strategy-optimization.api.js';
import {
  strategyComparisonOperatorLabel,
  strategyMonitoringCoverageSourceLabel,
  strategyMonitoringMetricLabel,
  strategyRiskEvaluationStateLabel,
  strategyTimeframeLabel,
} from './strategy-display-labels.js';

export function StrategyRiskPreview({
  preview,
  children,
  renderRuleSettings,
}: {
  preview: RiskApplicationPreview;
  children?: ReactNode;
  renderRuleSettings?: (rule: RiskApplicationPreview['plan']['rules'][number]) => ReactNode;
}) {
  const firstReason = preview.evaluations[0]?.reason;
  const commonReason =
    firstReason &&
    preview.evaluations.every(
      (evaluation) => evaluation.state === 'unavailable' && evaluation.reason === firstReason,
    )
      ? firstReason
      : null;
  const unmapped = preview.plan.coverage.items.filter((item) => item.status !== 'mapped');
  return (
    <section aria-label="规则预览" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">规则预览</h3>
        <Badge variant="secondary">
          已映射 {preview.plan.coverage.riskMapped}/{preview.plan.coverage.riskTotal} 项
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{preview.context.positionId ? '已关联实际持仓' : '当前无持仓'}</span>
        {commonReason ? <span>{commonReason}，暂时无法评估规则。</span> : null}
      </div>
      {renderRuleSettings ? <p className="text-xs text-muted-foreground">单条规则可覆盖默认值；冷却时间留空时继承默认值，0 表示不等待。</p> : null}
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {preview.plan.rules.map((rule) => {
          const evaluation = preview.evaluations.find((item) => item.sourceKey === rule.sourceKey);
          const threshold =
            rule.metric === 'priceToAverageCostReturn'
              ? formatDecimalRatioPercent(rule.threshold, 3)
              : `${rule.threshold} 期`;
          return (
            <li
              key={rule.sourceKey}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h4 className="font-medium">{rule.label}</h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {strategyMonitoringMetricLabel(rule.metric)}{' '}
                  {strategyComparisonOperatorLabel(rule.operator)}{' '}
                  <span className="font-medium tabular-nums text-foreground">{threshold}</span> ·{' '}
                  {strategyTimeframeLabel(rule.evaluationTimeframe)}
                </p>
              </div>
              <Badge variant="outline">{strategyRiskEvaluationStateLabel(evaluation?.state)}</Badge>
              {evaluation?.reason && !commonReason ? (
                <p className="col-span-2 text-xs text-muted-foreground">{evaluation.reason}</p>
              ) : null}
              {renderRuleSettings ? <div className="col-span-2 min-w-0 pt-2">{renderRuleSettings(rule)}</div> : null}
            </li>
          );
        })}
      </ul>
      {unmapped.length > 0 ? (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">未转换条件</h4>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs leading-relaxed">
              {unmapped.map((item) => (
                <div key={`${item.category}:${item.source}`} className="contents">
                  <dt className="text-muted-foreground">
                    {strategyMonitoringCoverageSourceLabel(item.source)}
                  </dt>
                  <dd>{item.reason}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      ) : null}
      {children}
    </section>
  );
}
