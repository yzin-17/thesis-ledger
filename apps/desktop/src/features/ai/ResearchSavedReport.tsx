import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResearchReportDetail } from '@thesis-ledger/schemas';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import {
  reportToAiRun,
  reportEvidenceLocator,
  researchQualityReason,
} from './research-report-display.js';
import { researchKeys } from './research.queries.js';
import { ResearchReportContent } from './ResearchReportContent.js';
import { ResearchEvidenceRead } from './ResearchEvidenceRead.js';
import { ResearchInferenceSections, ResearchTextSection } from './ResearchInferenceSections.js';
import { ResearchComparison } from './ResearchComparison.js';
import type { ResearchComparisonChoice } from './research-comparison-display.js';
import { ResearchObservations } from './ResearchObservations.js';
import { ResearchNextActions } from './ResearchNextActions.js';
import { researchStateMeta } from './research-state-display.js';
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
            type="button"
            variant="outline"
            size="sm"
            disabled={!report.submission || cancel.isPending}
            onClick={() => cancel.mutate()}
          >
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
function ResearchLegacyReport({
  report,
  onRetry,
  onOpenSource,
}: {
  report: ResearchReportDetail;
  onRetry: () => void;
  onOpenSource: (href: string) => void;
}) {
  const result = report.result;
  const ids = new Set(
    result?.version === 1
      ? result.evidence.flatMap((entry) =>
          entry.citations.flatMap((citation) => (citation.toolCallId ? [citation.toolCallId] : [])),
        )
      : [],
  );
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>历史范围未记录</AlertTitle>
        <AlertDescription>
          旧报告保留原文，不按当前账户模式重新归类。
          {report.availability === 'pending_verification' && '引用归属尚待核验。'}
        </AlertDescription>
      </Alert>
      {report.availability === 'pending_verification' && result?.version === 1 && (
        <section
          aria-label="待核验的历史正文"
          className="flex flex-col gap-3 rounded-md border p-4"
        >
          <h3 className="font-semibold">待核验的历史正文</h3>
          <p className="whitespace-pre-wrap text-sm leading-6">{result.conclusion}</p>
          <ResearchTextSection title="旧报告风险陈述" items={result.risks} />
          <ResearchTextSection title="旧报告未知项" items={result.unknowns} />
          <ResearchTextSection
            title="旧报告证据陈述（关联待核验）"
            items={result.evidence.map((entry) => entry.claim)}
          />
        </section>
      )}
      <ResearchReportContent
        run={reportToAiRun(report)}
        toolCalls={[]}
        onRetry={onRetry}
        onOpenSource={onOpenSource}
      />
      {report.availability === 'available' &&
        [...ids].map((id, index) => (
          <ResearchEvidenceRead
            key={id}
            runId={report.id}
            referenceId={id}
            locator={{ view: 'legacy' }}
            label={'核对历史引用 ' + (index + 1)}
          />
        ))}
    </div>
  );
}
export function ResearchSavedReport({
  report,
  onRetry,
  onOpenSource,
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
    return <ResearchLegacyReport report={report} onRetry={onRetry} onOpenSource={onOpenSource} />;
  if (report.historicalScope.snapshot.mode !== mode)
    return (
      <Alert>
        <AlertTitle>报告属于另一账户模式</AlertTitle>
        <AlertDescription>请通过全局模式开关回到原范围后读取。</AlertDescription>
      </Alert>
    );
  const partial = report.quality?.status === 'partial';
  return (
    <article className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{mode === 'shadow' ? '模拟范围' : '实际范围'}</Badge>
        <Badge variant={partial ? 'secondary' : 'outline'}>
          {partial ? '资料不完整' : '按保存版本读取'}
        </Badge>
      </div>
      <ResearchRunStatus report={report} onRetry={onRetry} />
      <ResearchNextActions report={report} onPrepare={onRetry} />
      {partial && (
        <ResearchTextSection
          title="资料质量与限制"
          items={[...new Set((report.quality?.reasons ?? []).map(researchQualityReason))]}
        />
      )}
      {report.status === 'succeeded' && report.availability !== 'available' && (
        <Alert variant="destructive">
          <AlertTitle>保存的研究结果无法核验</AlertTitle>
          <AlertDescription>正文或引用关联不完整，请保留任务标识以便排查。</AlertDescription>
        </Alert>
      )}
      {report.status === 'succeeded' && report.availability === 'available' && (
        <>
          <ResearchComparison
            report={report}
            choices={comparisonChoices}
            contextKey={comparisonContextKey}
          />
          <ResearchObservations report={report} contextKey={comparisonContextKey} />
        </>
      )}
      {report.result?.version === 2 && (
        <ResearchInferenceSections
          result={report.result}
          runId={report.id}
          locator={reportEvidenceLocator(report.historicalScope.snapshot)}
        />
      )}
    </article>
  );
}
