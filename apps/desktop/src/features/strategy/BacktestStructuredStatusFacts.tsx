import { BacktestBasicLifecycleFacts } from './BacktestBasicLifecycleFacts';
import type { BacktestTradingStatusDisclosureV3 } from '@thesis-ledger/schemas';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';

export function BacktestStructuredStatusFacts({
  disclosure,
}: {
  disclosure: BacktestTradingStatusDisclosureV3;
}) {
  if (disclosure.status !== 'source' || !disclosure.response.sourceRecords) return null;
  const { response, structuredResearch } = disclosure;
  const coverage = response.structuredCoverage!;
  const flagged = response.days.filter((day) => day.coarseST === 'flagged');
  const unflaggedCount = response.days.filter((day) => day.coarseST === 'notFlagged').length;
  return (
    <div className="flex flex-col gap-2">
      <BacktestBasicLifecycleFacts lifecycle={response.basicLifecycle} />
      <div>
        ST 粗标记：标记 1 共 {flagged.length} 日，标记 0 共 {unflaggedCount} 日，缺失{' '}
        {coverage.stUnknownDates.length} 个交易日。
        {flagged.length > 0 && (
          <> 标记 1 日期：{flagged.map((day) => formatDateOnly(day.date)).join('、')}。</>
        )}
        该标记不区分 ST、*ST 或其他风险警示，不推导精确价格限制。
      </div>
      <div>
        交易状态缺失 {coverage.statusUnknownDates.length} 个交易日，日历未知{' '}
        {coverage.calendarUnknownDates.length} 日；未知维度沿用已选研究假设。
      </div>
      {response.sourceRecords?.map((record) => (
        <div key={record.id} className="flex flex-col gap-1">
          <div>结构化资料实际取得：{formatDateTime(record.observedAt)}</div>
          <div className="break-all">规范化查询响应摘要：{record.responseSha256}</div>
        </div>
      ))}
      {structuredResearch && (
        <div>
          价格冻结截点：{formatDateTime(structuredResearch.priceDataAsOf)}；状态冻结：
          {formatDateTime(structuredResearch.frozenAt)}。
          {structuredResearch.observedAfterPriceCutoff &&
            '状态实际取得晚于价格截点；本次为固定来源研究，不作为历史当时可见信号。'}
        </div>
      )}
    </div>
  );
}
