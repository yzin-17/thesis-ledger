import { Spinner } from '@/components/ui/spinner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResearchReportDetail } from '@thesis-ledger/schemas';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import {
  reportToAiRun,
  reportEvidenceLocator,
  researchQualityReason,
} from './research-report-display.js';
import { researchKeys } from './research.queries.js';
import { ResearchEvidenceRead } from './ResearchEvidenceRead.js';
import { ResearchInferenceSections, ResearchTextSection } from './ResearchInferenceSections.js';
import { ResearchComparison } from './ResearchComparison.js';
import type { ResearchComparisonChoice } from './research-comparison-display.js';
import { ResearchObservations } from './ResearchObservations.js';
import { ResearchNextActions } from './ResearchNextActions.js';
import { researchStateMeta } from './research-state-display.js';
import { questionSummary } from './ai.display.js';
export { researchQualityReason } from './research-report-display.js';

function ResearchRunStatus({
  report,
  onRetry,
}: {
  report: ResearchReportDetail;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationKey: [...researchKeys.root, report.id, 'cancel'],
    retry: false,
    mutationFn: async () => {
      if (!report.submission) throw new Error('提交身份未记录');
      return getDesktopApiClient().research.cancel(report.submission);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: researchKeys.root });
    },
  });
  useNavigationGuard({ dirty: false, busy: cancel.isPending });
  return (
    <>
      {['queued', 'running'].includes(report.status) && (
        <Alert>
          <AlertTitle>
            {researchStateMeta[report.status === 'queued' ? 'queued' : 'running'].label}
          </AlertTitle>
          <AlertDescription>状态来自服务端，完成后自动更新。</AlertDescription>
          <Button
            aria-busy={cancel.isPending}
            type="button"
            variant="outline"
            size="sm"
            disabled={!report.submission || cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {cancel.isPending ? '正在确认取消…' : '取消研究'}
          </Button>
        </Alert>
      )}
      {cancel.isError && ['queued', 'running'].includes(report.status) && (
        <Alert variant="destructive">
          <AlertTitle>取消尚未确认</AlertTitle>
          <AlertDescription>请重新读取状态；原提交标识保持不变。</AlertDescription>
        </Alert>
      )}
      {report.status === 'cancelled' && (
        <Alert>
          <AlertTitle>{researchStateMeta.cancelled.label}</AlertTitle>
          <AlertDescription>已保留原任务与审计事实。</AlertDescription>
        </Alert>
      )}
      {report.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>{researchStateMeta.failed.label}</AlertTitle>
          <AlertDescription>
            {report.errorSummary ?? '执行未能完成，请核对资料后重新创建。'}
          </AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            使用原问题新建
          </Button>
        </Alert>
      )}
    </>
  );
}
export function ResearchSavedReport({
  report,
  onRetry,
  comparisonChoices = [],
  comparisonContextKey = '',
}: {
  report: ResearchReportDetail;
  onRetry: () => void;
  onOpenSource: (href: string) => void;
  comparisonChoices?: ResearchComparisonChoice[];
  comparisonContextKey?: string;
}) {
  const mode = useOptionalPortfolioMode()?.mode ?? 'actual';
  if (report.historicalScope.status === 'unrecorded')
    return <Alert><AlertDescription>研究范围不可用。</AlertDescription></Alert>;
  if (report.historicalScope.snapshot.mode !== mode)
    return (
      <Alert>
        <AlertTitle>报告属于另一账户模式</AlertTitle>
        <AlertDescription>请通过全局模式开关回到原范围后读取。</AlertDescription>
      </Alert>
    );
  const partial = report.quality?.status === 'partial';
  return (
    <article className="flex min-w-0 flex-col gap-5 break-words">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{mode === 'shadow' ? '模拟范围' : '实际范围'}</Badge>
        <Badge variant={partial ? 'secondary' : 'outline'}>
          {partial ? '资料不完整' : '按保存版本读取'}
        </Badge>
      </div>
      <ResearchRunStatus report={report} onRetry={onRetry} />
      {!(report.result?.version === 'research-report-result-v1' && report.availability === 'available') && (
        <ResearchReportQuality report={report} />
      )}
      {report.status === 'succeeded' && report.availability !== 'available' && (
        <Alert variant="destructive">
          <AlertTitle>保存的研究结果无法核验</AlertTitle>
          <AlertDescription>正文或引用关联不完整，请保留任务标识以便排查。</AlertDescription>
        </Alert>
      )}
      <ResearchVerifiedInference report={report} snapshot={report.historicalScope.snapshot} />
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">研究背景</summary>
        <p className="py-3 break-words whitespace-pre-wrap text-sm leading-6">
          {questionSummary(reportToAiRun(report))}
        </p>
      </details>
      {report.status === 'succeeded' && report.availability === 'available' && (
        <>
          <Separator />
          <ResearchComparison
            report={report}
            choices={comparisonChoices}
            contextKey={comparisonContextKey}
          />
          {report.result?.version === 'research-report-result-v1' && (
            <ResearchObservations report={report} contextKey={comparisonContextKey} />
          )}
        </>
      )}
      <ResearchNextActions report={report} onPrepare={onRetry} />
      <ResearchSavedFields report={report} />
    </article>
  );
}

function ResearchSavedFields({ report }: { report: ResearchReportDetail }) {
  return (
    <details>
      <summary className="cursor-pointer py-2 text-sm font-medium">完整报告与保存字段</summary>
      <p className="py-2 break-all text-xs text-muted-foreground">任务：{report.id}</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
        {JSON.stringify(report, null, 2)}
      </pre>
    </details>
  );
}

function ResearchVerifiedInference({
  report,
  snapshot,
}: {
  report: ResearchReportDetail;
  snapshot: Parameters<typeof reportEvidenceLocator>[0];
}) {
  const result = report.result;
  if (result?.version !== 'research-report-result-v1' || report.availability !== 'available') return null;
  return (
    <ResearchInferenceSections
      result={result}
      runId={report.id}
      locator={reportEvidenceLocator(snapshot)}
    />
  );
}

function ResearchReportQuality({ report }: { report: ResearchReportDetail }) {
  const partial = report.quality?.status === 'partial';
  return (
    <>
      {' '}
      {partial && (
        <ResearchTextSection
          title="资料质量与限制"
          items={[...new Set((report.quality?.reasons ?? []).map(researchQualityReason))]}
        />
      )}
    </>
  );
}
