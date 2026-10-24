import type {
  JournalReviewCandidateContract,
  JournalDeterministicReview,
} from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';
const metricLabels: Record<string, string> = {
  plannedEntryPrice: '计划入场价',
  actualEntryPrice: '实际入场价',
  entryPriceDeviation: '入场价格偏差',
  entryPriceDeviationRatio: '入场价格偏差比例',
  plannedExitPrice: '计划退出价',
  actualExitPrice: '实际退出价',
  exitPriceDeviation: '退出价格偏差',
  exitPriceDeviationRatio: '退出价格偏差比例',
  plannedHoldingDays: '计划持有天数',
  actualHoldingDays: '实际持有天数',
  holdingDayDeviation: '持有天数偏差',
  plannedStopPrice: '计划止损价',
  stopExitDeviation: '止损价格偏差',
  realizedNetReturnRate: '已实现净收益率',
  executedQuantity: '实际退出数量',
  counterfactualNetPnl: '按止损价退出的假设净收益',
  counterfactualDifference: '假设与实际净收益差额',
  plannedEntry: '计划入场',
  plannedExit: '计划离场',
  actualEntry: '实际入场',
  actualExit: '实际离场',
  entryDeviation: '入场偏差',
  exitDeviation: '离场偏差',
  netRealizedPnl: '已实现净盈亏',
  grossRealizedPnl: '已实现毛盈亏',
  holdingDays: '持有天数',
  averageHoldingDays: '平均持有天数',
  sampleCount: '样本数',
  winRate: '胜率',
  profitLossRatio: '盈亏比',
};
export function JournalFacts({ candidate }: { candidate: JournalReviewCandidateContract }) {
  const { trade, projection, reference } = candidate.input;
  return (
    <Section title="服务端原始事实">
      <Copy>
        {trade.symbol} ·{' '}
        {reference.reviewObjectType === 'TRADE_CYCLE' ? '完整交易周期' : '单次减仓'}
      </Copy>
      <Copy>交易 {reference.tradeId}</Copy>
      {reference.reviewObjectType === 'CLOSE_SLICE' ? (
        <Copy>片段 {reference.closeSliceId}</Copy>
      ) : null}
      <Copy>
        开仓 {candidate.openedAt ?? '时间未知'} · 平仓{' '}
        {candidate.effectiveClosedAt ?? candidate.executedAt ?? '未结束'}
      </Copy>
      <Copy>
        账本修订 {projection.ledgerRevision} · 投影世代 {projection.projectionGeneration}
      </Copy>
      <Copy>事实指纹 {projection.evidenceFingerprint}</Copy>
      <Copy>
        {candidate.statisticsEligibility.eligible ? '符合统计资格' : '未纳入统计'} ·{' '}
        {candidate.statisticsEligibility.reasons.join('；')}
      </Copy>
      {candidate.missingEvidence.length ? (
        <Copy muted>缺失证据：{candidate.missingEvidence.join('；')}</Copy>
      ) : null}
      <Copy muted>以下计算由服务端完成，草稿只补充本次分析输入。</Copy>
    </Section>
  );
}
export function JournalMetrics({ metrics }: { metrics: JournalDeterministicReview['metrics'] }) {
  return (
    <Section title="确定性指标">
      {Object.entries(metrics).map(([key, value]) => (
        <Copy key={key}>
          {metricLabels[key] ?? key}：{value.status === 'AVAILABLE' ? value.value : '不可用'}
          {value.status !== 'AVAILABLE' ? `（${value.missingEvidence.join('；')}）` : ''}
        </Copy>
      ))}
    </Section>
  );
}
export function JournalResult({ result }: { result: JournalDeterministicReview }) {
  return (
    <>
      <Copy>算法 {result.algorithmVersion}</Copy>
      <JournalMetrics metrics={result.metrics} />
      {result.behaviorNotes.map((note, i) => (
        <Copy key={i}>{note}</Copy>
      ))}
      {result.assumptions.map((note, i) => (
        <Copy muted key={i}>
          {note}
        </Copy>
      ))}
    </>
  );
}
