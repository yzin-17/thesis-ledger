import type { ReactNode } from 'react';
import type { JournalReviewCandidateContract } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/date-display';
import { evidenceLabel, reviewObjectLabels, reviewStatusLabels } from './journal-review-display.js';
import { JournalSourceFacts } from './JournalSourceFacts.js';

export function JournalFactSummary({
  candidate,
  actions,
  editor,
  compact = false,
  instrumentLabel,
}: {
  candidate: JournalReviewCandidateContract;
  actions?: ReactNode;
  editor?: ReactNode;
  compact?: boolean;
  instrumentLabel?: string | undefined;
}) {
  const { input } = candidate;
  const trade = input.trade;
  const reference = input.reference;
  const slice =
    reference.reviewObjectType === 'CLOSE_SLICE'
      ? trade.closeSlices.find((row) => row.id === reference.closeSliceId)
      : null;
  const exitAt = slice ? slice.occurredAt : trade.closedAt;
  const netPnl = slice ? slice.netRealizedPnl : trade.netRealizedPnl;
  const evidenceReasons = [
    ...new Set(
      [...candidate.statisticsEligibility.reasons, ...candidate.missingEvidence].map(evidenceLabel),
    ),
  ];

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="复盘事实概览">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold break-words">
            {instrumentLabel ?? trade.symbol}
            <span className="font-normal text-muted-foreground">
              {' · '}
              {reviewObjectLabels[input.reference.reviewObjectType]}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
        {actions}
        {editor}
      </div>

      {evidenceReasons.length > 0 && (
        <p className="text-sm leading-6">{evidenceReasons.join('；')}</p>
      )}
      <details open={compact ? undefined : true}>
        <summary className="cursor-pointer py-2 text-sm font-medium">交易事实与来源</summary>
        <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <dt className="text-xs font-normal text-muted-foreground">真实开仓时间</dt>
            <dd>{formatDateTime(trade.openedAt, '未知')}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <dt className="text-xs font-normal text-muted-foreground">退出 / 结束时间</dt>
            <dd>{formatDateTime(exitAt, '尚未结束或未知')}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <dt className="text-xs font-normal text-muted-foreground">原始数量 / 当前减仓数量</dt>
            <dd className="break-all font-mono">{slice?.quantity ?? trade.sourceQuantity}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <dt className="text-xs font-normal text-muted-foreground">实际已实现净收益</dt>
            <dd className="break-all font-mono">{netPnl ?? '证据不足'}</dd>
          </div>
        </dl>

        <div className="flex flex-col border-t">
          <details className="border-b">
            <summary className="cursor-pointer py-3 text-sm font-medium">成交与计划来源</summary>
            <div className="pb-4">
              <JournalSourceFacts input={input} />
            </div>
          </details>
          <details className="border-b">
            <summary className="cursor-pointer py-3 text-sm font-medium">原始证据数据</summary>
            <div className="flex flex-col gap-3 pb-4">
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
        </div>
      </details>
    </section>
  );
}
