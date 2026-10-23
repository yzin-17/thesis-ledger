import { useState } from 'react';
import type {
  ResearchReportDetail,
  ResearchReportLocatorInput,
  ResearchReportObservations,
} from '@thesis-ledger/schemas';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { reportEvidenceLocator } from './research-report-display.js';
import { useResearchIdentity, useResearchObservationsQuery } from './research.queries.js';
import { researchObservationState, researchStateMeta } from './research-state-display.js';
import {
  ResearchObservationResult,
  ResearchObservationHistory,
  ResearchObservationStatistics,
} from './ResearchObservationResult.js';
import { useResearchObservation } from './use-research-observation.js';

export function ResearchObservations({
  report,
  contextKey = '',
}: {
  report: ResearchReportDetail;
  contextKey?: string;
}) {
  const owner = useResearchIdentity();
  if (report.historicalScope.status !== 'known' || report.result?.version !== 2) return null;
  const locator = reportEvidenceLocator(report.historicalScope.snapshot);
  return (
    <ObservationCard
      key={JSON.stringify([owner, report.id, locator, contextKey])}
      report={report}
      locator={locator}
    />
  );
}
function ObservationCard({
  report,
  locator,
}: {
  report: ResearchReportDetail;
  locator: ResearchReportLocatorInput;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card aria-label="研究结论复核">
      <CardHeader>
        <CardTitle>研究结论复核</CardTitle>
        <CardDescription>
          按保存的结构化断言观察固定交易日窗口，保留每次资料与结果。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? '收起复核状态' : '查看复核状态'}
        </Button>
        {open && <ObservationRead report={report} locator={locator} />}
      </CardContent>
    </Card>
  );
}
function ObservationRead({
  report,
  locator,
}: {
  report: ResearchReportDetail;
  locator: ResearchReportLocatorInput;
}) {
  const query = useResearchObservationsQuery(report.id, locator, true);
  if (query.isFetching || query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError || !query.data)
    return (
      <Alert variant="destructive">
        <AlertTitle>复核状态暂不可读</AlertTitle>
        <AlertDescription>访问范围可能已变化，或读取未完成。请重新读取。</AlertDescription>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          重新读取复核状态
        </Button>
      </Alert>
    );
  const data = query.data;
  const result = report.result;
  if (result?.version !== 2 || data.availability !== 'available')
    return (
      <Alert>
        <AlertTitle>自动复核暂不可用</AlertTitle>
        <AlertDescription>{data.issues.join(' ') || '请保留原报告供人工核对。'}</AlertDescription>
      </Alert>
    );
  const claims = new Map(result.inference.claims.map((claim) => [claim.id, claim]));
  const coherent = data.items.every((item) => {
    const claim = claims.get(item.claimId);
    if (!claim) return false;
    if (claim.kind === 'qualitative')
      return item.instrumentId === null && item.direction === null && item.tradingDays === null;
    return (
      item.instrumentId === claim.instrumentId &&
      item.direction === claim.direction &&
      item.tradingDays === claim.tradingDays
    );
  });
  if (!coherent)
    return (
      <Alert variant="destructive">
        <AlertTitle>复核字段与原报告不一致</AlertTitle>
        <AlertDescription>请重新读取报告并核对断言。</AlertDescription>
      </Alert>
    );
  return (
    <div className="flex flex-col gap-4" aria-label="研究复核状态">
      {data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">报告尚未包含可观察的结构化断言。</p>
      )}
      {data.items.map((item) => (
        <ObservationItem
          key={item.claimId}
          runId={report.id}
          item={item}
          description={claims.get(item.claimId)!.description}
          asOf={data.asOf}
          locator={locator}
        />
      ))}
      <ResearchObservationStatistics value={data.statistics} />
    </div>
  );
}
function ObservationItem({
  runId,
  item,
  description,
  asOf,
  locator,
}: {
  runId: string;
  item: ResearchReportObservations['items'][number];
  description: string;
  asOf: string;
  locator: ResearchReportLocatorInput;
}) {
  const state = researchStateMeta[researchObservationState(item, asOf)];
  const command = useResearchObservation(runId, item.claimId, locator);
  const applicable = item.tradingDays !== null;
  return (
    <section aria-label={description} className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{description}</h4>
        <Badge variant="outline">{state.label}</Badge>
        {command.mutation.isPending && (
          <Badge variant="secondary">{researchStateMeta.review_pending.label}</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{state.description}</p>
      {item.current && <ResearchObservationResult version={item.current} />}
      {command.mutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>本次提交尚未确认</AlertTitle>
          <AlertDescription>找回将使用相同提交标识及资料截止时点。</AlertDescription>
        </Alert>
      )}
      {!command.mutation.isPending && command.command?.state === 'failed' && (
        <Alert>
          <AlertTitle>本次复核未能完成</AlertTitle>
          <AlertDescription>失败尝试已经保留，可以显式发起下一次复核。</AlertDescription>
        </Alert>
      )}
      {!command.mutation.isPending && command.command?.state === 'pending' && (
        <Alert>
          <AlertTitle>本次处理状态待确认</AlertTitle>
          <AlertDescription>可找回同一次尝试，避免重复创建。</AlertDescription>
        </Alert>
      )}
      {applicable && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={command.mutation.isPending}
          onClick={command.submit}
        >
          {command.label}
        </Button>
      )}
      <ResearchObservationHistory runId={runId} item={item} locator={locator} />
    </section>
  );
}
