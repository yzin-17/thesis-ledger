import { Button } from '@/components/ui/button';
import { AutomationReadWarning } from './AutomationReadWarning.js';
import { automationRunTimeLabel } from './automation-read-display.js';
import { resolveLoadState } from '../shared/loadState.js';
import { SimpleProviderTable } from './ProviderReadTable.js';
import type { useProviderQueries } from './providers.queries.js';
import {
  automationRunStatusLabel,
  providerHealthSourceLabel,
  providerHealthStateLabel,
  type AutomationJob,
} from './providers.types.js';

type Queries = ReturnType<typeof useProviderQueries>;
type Page = { page: number; total: number; totalPages: number };

function healthIssueSummary(item: NonNullable<Queries['healthFailures']['data']>['items'][number]) {
  const error = item.errorCode;
  if (error) return error;
  if (item.state === 'degraded') return '响应较慢';
  return '未记录错误码';
}

function DiagnosticPagination({
  title,
  page,
  loading,
  onPage,
}: {
  title: string;
  page: Page | undefined;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  if (!page?.total) return null;
  return (
    <nav
      className="mt-3 flex flex-wrap items-center justify-between gap-3"
      aria-label={`${title}分页`}
    >
      <p className="m-0 text-sm text-muted-foreground">
        第 {page.page} / {page.totalPages} 页，共 {page.total} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page.page <= 1}
          onClick={() => onPage(page.page - 1)}
        >
          上一页
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || page.page >= page.totalPages}
          onClick={() => onPage(page.page + 1)}
        >
          下一页
        </Button>
      </div>
    </nav>
  );
}

export function ProviderFailureDiagnostics({
  health,
  automation,
  jobs,
  onHealthPage,
  onAutomationPage,
}: {
  health: Queries['healthFailures'];
  automation: Queries['automationFailures'];
  jobs: AutomationJob[];
  onHealthPage: (page: number) => void;
  onAutomationPage: (page: number) => void;
}) {
  const names = new Map(jobs.map((job) => [job.id, job.name]));
  return (
    <>
      <SimpleProviderTable
        title="来源检查异常"
        description="显示已记录的连接检查异常及慢响应降级，恢复后仍保留历史；普通数据请求未全部纳入。"
        columns={['提供方', '状态', '检查时间', '检查来源', '错误码']}
        tableClassName="w-full min-w-5xl table-fixed"
        columnClassNames={['w-[16%]', 'w-[9%]', 'w-[24%]', 'w-[15%]', 'w-[36%]']}
        emptyColSpan={5}
        loadState={resolveLoadState([health], health.data !== undefined, health.data?.total === 0)}
        refreshing={health.isFetching && health.data !== undefined}
        onRetry={() => void health.refetch()}
        rows={(health.data?.items ?? []).map((item, index) => ({
          id: `${item.provider}-${item.checkedAt}-${index}`,
          cells: [
            item.provider,
            providerHealthStateLabel(item.state),
            new Date(item.checkedAt).toLocaleString('zh-CN'),
            providerHealthSourceLabel(item.source),
            healthIssueSummary(item),
          ],
        }))}
        footer={
          <DiagnosticPagination
            title="来源检查异常"
            page={health.data}
            loading={health.isFetching}
            onPage={onHealthPage}
          />
        }
      />
      <SimpleProviderTable
        title="自动化运行异常"
        description="显示执行失败、部分资料不可读、中断或结果待确认的历史记录。"
        notice={<AutomationReadWarning warnings={automation.data?.sourceWarnings} />}
        wrapColumns={[3]}
        columns={['任务', '状态', '开始时间', '错误']}
        tableClassName="w-full min-w-5xl table-fixed"
        columnClassNames={['w-[22%]', 'w-[14%]', 'w-[24%]', 'w-[40%]']}
        emptyColSpan={4}
        loadState={resolveLoadState(
          [automation],
          automation.data !== undefined,
          automation.data?.total === 0,
        )}
        refreshing={automation.isFetching && automation.data !== undefined}
        onRetry={() => void automation.refetch()}
        rows={(automation.data?.items ?? []).map((item) => ({
          id: item.id,
          cells: [
            item.jobName ?? names.get(item.jobId) ?? item.jobId.slice(0, 8),
            automationRunStatusLabel(item.status),
            automationRunTimeLabel(item),
            item.error ?? '未记录错误摘要',
          ],
        }))}
        footer={
          <DiagnosticPagination
            title="自动化运行异常"
            page={automation.data}
            loading={automation.isFetching}
            onPage={onAutomationPage}
          />
        }
      />
    </>
  );
}
