import type { JournalReviewCandidateContract } from '@thesis-ledger/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { evidenceLabel, reviewObjectLabels, reviewStatusLabels } from './journal-review-display.js';
import { JournalSourceFacts } from './JournalSourceFacts.js';

export function JournalFactSummary({ candidate }: { candidate: JournalReviewCandidateContract }) {
  const { input } = candidate;
  const trade = input.trade;
  const reference = input.reference;
  const slice =
    reference.reviewObjectType === 'CLOSE_SLICE'
      ? trade.closeSlices.find((row) => row.id === reference.closeSliceId)
      : null;
  const exitAt = slice ? slice.occurredAt : trade.closedAt;
  const netPnl = slice ? slice.netRealizedPnl : trade.netRealizedPnl;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {trade.symbol} · {reviewObjectLabels[input.reference.reviewObjectType]}
        </CardTitle>
        <CardDescription>实际事实来自账户交易投影；基线观察与真实成交分开呈现。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {trade.lifecycle === 'ENDED' ? '已结束周期' : '持有中周期'}
          </Badge>
          <Badge variant="outline">{reviewStatusLabels[candidate.reviewStatus]}</Badge>
          <Badge variant="outline">
            {candidate.statisticsEligibility.eligible
              ? '符合本粒度统计资格'
              : '不进入本粒度默认统计'}
          </Badge>
        </div>
        <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">真实开仓时间</dt>
            <dd>{trade.openedAt ?? '未知'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">退出 / 结束时间</dt>
            <dd>{exitAt ?? '尚未结束或未知'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">原始数量 / 当前减仓数量</dt>
            <dd className="break-all font-mono">{slice?.quantity ?? trade.sourceQuantity}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">实际已实现净收益</dt>
            <dd className="break-all font-mono">{netPnl ?? '证据不足'}</dd>
          </div>
        </dl>
        {[...candidate.statisticsEligibility.reasons, ...candidate.missingEvidence].length > 0 && (
          <p className="text-sm text-muted-foreground">
            {[...candidate.statisticsEligibility.reasons, ...candidate.missingEvidence]
              .map(evidenceLabel)
              .join('；')}
          </p>
        )}
        <JournalSourceFacts input={input} />
        <details>
          <summary className="cursor-pointer text-sm">查看原始计划与事实来源</summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm">
              {input.plan
                ? '计划关联已有明确证明。原计划与本次草稿分别保留。'
                : '没有明确关联的计划。可在本次草稿中补充假设。'}
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(
                {
                  reference: input.reference,
                  plan: input.plan,
                  entryLegs: trade.entryLegs,
                  closeSlices: slice ? [slice] : trade.closeSlices,
                  baselineComponents: trade.baselineComponents,
                  corporateActions: trade.corporateActions,
                  journalEntries: input.journalEntries,
                  projection: input.projection,
                  fxEvidence: input.fxEvidence,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
