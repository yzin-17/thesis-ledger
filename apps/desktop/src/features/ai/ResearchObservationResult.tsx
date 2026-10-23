import { useState } from 'react';
import type {
  ResearchObservationVersion,
  ResearchReportObservations,
  ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFullDateTime } from './ai.display.js';
import { useResearchObservationHistoryQuery } from './research.queries.js';
import { researchObservationState, researchStateMeta } from './research-state-display.js';
import {
  observationReasonLabel,
  observationRateLabel,
  observationSampleLabel,
} from './research-observation-display.js';

export function ResearchObservationResult({ version }: { version: ResearchObservationVersion }) {
  const { window, economic, reasons } = version.evaluation;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {window.startSession && window.endSession && (
        <p>
          第 0 日 {window.startSession} → 第 {window.tradingDays} 个交易日 {window.endSession}
        </p>
      )}
      {window.endCloseAt && (
        <p className="text-xs text-muted-foreground">
          窗口收盘：{formatFullDateTime(window.endCloseAt)}
        </p>
      )}
      {version.evaluation.status === 'completed' && (
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">经济收盘价格</dt>
            <dd>
              {economic.startPrice} → {economic.endPrice} {economic.currency}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">区间变化</dt>
            <dd>{observationRateLabel(economic.returnRate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">断言方向</dt>
            <dd>{economic.directionMatched ? '本次符合' : '本次未符合'}</dd>
          </div>
        </dl>
      )}
      {reasons.map((reason) => (
        <p key={reason} className="text-muted-foreground">
          {observationReasonLabel(reason)}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        资料截止：{formatFullDateTime(version.inputs.visibleAt)} · 保存于{' '}
        {formatFullDateTime(version.recordedAt)}
      </p>
    </div>
  );
}
export function ResearchObservationHistory({
  runId,
  item,
  locator,
}: {
  runId: string;
  item: ResearchReportObservations['items'][number];
  locator: ResearchReportLocatorInput;
}) {
  const [open, setOpen] = useState(false);
  const query = useResearchObservationHistoryQuery(runId, item.id, locator, open);
  if (!item.id) return null;
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="link"
        className="justify-start"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? '收起历次复核' : '查看历次复核'}
      </Button>
      {open && <ObservationHistoryRead item={item} query={query} />}
    </div>
  );
}
function ObservationHistoryRead({
  item,
  query,
}: {
  item: ResearchReportObservations['items'][number];
  query: ReturnType<typeof useResearchObservationHistoryQuery>;
}) {
  if (query.isFetching || query.isPending) return <Skeleton className="h-24 w-full" />;
  if (query.isError || !query.data)
    return (
      <Alert variant="destructive">
        <AlertTitle>历次复核暂不可读</AlertTitle>
        <AlertDescription>请核对当前访问范围后重新读取。</AlertDescription>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          重新读取历史
        </Button>
      </Alert>
    );
  return (
    <div aria-label="历次复核" className="flex flex-col gap-4">
      {query.data.versions.length === 0 && (
        <p className="text-sm text-muted-foreground">尚无已保存的复核版本。</p>
      )}
      {query.data.truncated && (
        <p className="text-xs text-muted-foreground">当前展示最近 100 个观察版本。</p>
      )}
      {query.data.versions.map((version) => (
        <section key={version.id} className="flex flex-col gap-2 rounded-md border p-3">
          <Badge variant="outline">
            {
              researchStateMeta[
                researchObservationState({ ...item, current: version }, version.inputs.visibleAt)
              ].label
            }
          </Badge>
          <ResearchObservationResult version={version} />
        </section>
      ))}
    </div>
  );
}
export function ResearchObservationStatistics({
  value,
}: {
  value: ResearchReportObservations['statistics'];
}) {
  return (
    <section aria-label="同范围观察统计" className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">同范围已存观察</h4>
        <Badge variant="outline">{observationSampleLabel(value)}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {(
          [
            ['去重样本', value.samples],
            ['已到期', value.dueSamples],
            ['可计算', value.calculatedSamples],
            ['到期时间未知', value.dueUnknownSamples],
            ['未到期', value.notDueSamples],
            ['不适用', value.notApplicableSamples],
          ] as const
        ).map(([label, count]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      {value.directionMatchRate !== null && (
        <p className="text-sm">
          描述性方向符合比例：{observationRateLabel(value.directionMatchRate)}
        </p>
      )}
      {value.sampleStatus === 'insufficient' && (
        <p className="text-xs text-muted-foreground">合格样本少于 20 个，方向符合比例保持未知。</p>
      )}
      {value.sampleStatus === 'incomplete' && (
        <p className="text-xs text-muted-foreground">统计集合未完整读取，方向符合比例保持未知。</p>
      )}
      {value.exclusions.length > 0 && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {value.exclusions.map((entry) => (
            <p key={entry.reason}>
              {observationReasonLabel(entry.reason)}（{entry.count} 项；同一观察可能有多个原因）
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        按相同研究范围、方法及截止时点读取保存的观察；多个输入版本和重试报告已去重。收益口径为原币经济收盘变化。
      </p>
    </section>
  );
}
