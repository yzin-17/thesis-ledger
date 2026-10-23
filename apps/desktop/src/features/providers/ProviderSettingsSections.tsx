import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import { EmptyTableRow } from '../shared/EmptyStates.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { isDataLoaded } from '../shared/display.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';
import type { LoadState } from '../shared/types.js';
import { ProviderModelSummary } from './ProviderModelSummary.js';
import { ProviderPriorityHeader } from './ProviderPriorityHeader.js';
import { AiProviderReadinessStatus } from './AiProviderReadinessStatus.js';
import {
  automationJobTypeLabel,
  automationOutputSummary,
  automationRunStatusLabel,
  dataQualityCodeLabel,
  dataQualityIssueReason,
  dataQualitySeverityLabel,
  notificationDeliveryStatusLabel,
  notificationErrorCodeLabel,
  providerCapabilityLabel,
  providerDisplayStatus,
  providerHealthSourceLabel,
  providerHealthStateLabel,
  isAiProvider,
  providerTypeLabel,
} from './providers.types.js';
import type {
  AutomationHistoryPage,
  AutomationJob,
  NotificationFailureRecord,
  ProviderHealthHistoryPage,
  ProviderIssueRecord,
  ProviderRecord,
} from './providers.types.js';

const toggleLabel = (busy: boolean, enabled: boolean) => {
  if (busy) return enabled ? '停用中…' : '启用中…';
  return enabled ? '停用' : '启用';
};

const providerTestActionLabel = (busy: boolean, isAi: boolean) => {
  if (busy) return '测试中…';
  return isAi ? '选择模型测试' : '测试连接';
};

export function ProviderTable({
  loadState,
  providers,
  priorityDrafts,
  testingProviderName,
  savingProviderName,
  deletingProviderName,
  onPriorityChange,
  onPrioritySave,
  onEdit,
  onTest,
  onToggle,
  onDelete,
  onCreate,
}: {
  loadState: LoadState;
  providers: ProviderRecord[];
  priorityDrafts: Record<string, number>;
  testingProviderName: string | null;
  savingProviderName: string | null;
  deletingProviderName: string | null;
  onPriorityChange: (name: string, value: number) => void;
  onPrioritySave: (provider: ProviderRecord) => void;
  onEdit: (provider: ProviderRecord) => void;
  onTest: (provider: ProviderRecord) => void;
  onToggle: (provider: ProviderRecord) => void;
  onDelete: (provider: ProviderRecord) => void;
  onCreate: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>提供方</h2>
          <p>编辑、连通性测试与启停；凭证配置后不回显密钥。</p>
        </div>
        <Button size="sm" type="button" variant="default" onClick={onCreate}>
          新增或更新提供方
        </Button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="text-center first:text-center">提供方</th>
              <th className="text-center">能力</th>
              <th className="text-center">
                <ProviderPriorityHeader />
              </th>
              <th className="text-center">状态</th>
              <th className="text-center">凭证</th>
              <StickyTableActionHeader className="text-center">操作</StickyTableActionHeader>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && providers.length === 0 ? (
              <EmptyTableRow colSpan={6} />
            ) : (
              providers.map((provider) => {
                const status = providerDisplayStatus(provider);
                const priority = priorityDrafts[provider.name] ?? provider.priority;
                const isAi = isAiProvider(provider);
                // 类型标签与能力列重复时不重复展示（如通知 Provider 的「通知」）
                const typeLabel = providerTypeLabel(provider.type);
                const capabilityLabels: string[] =
                  provider.capabilities.map(providerCapabilityLabel);
                const showTypeLabel = !capabilityLabels.includes(typeLabel);
                return (
                  <tr key={provider.name}>
                    <td className="text-left first:text-left">
                      <strong>{provider.name}</strong>
                      {showTypeLabel ? <span>{typeLabel}</span> : null}
                      {isAi && provider.models?.length ? (
                        <ProviderModelSummary models={provider.models} />
                      ) : null}
                    </td>
                    <td className="text-left">
                      {provider.capabilities.map(providerCapabilityLabel).join(' · ')}
                    </td>
                    <td className="text-left">
                      {isAi ? (
                        priority
                      ) : (
                        <Input
                          className="w-20"
                          aria-label={`${provider.name} 优先级`}
                          type="number"
                          min={0}
                          value={priority}
                          onChange={(event) =>
                            onPriorityChange(provider.name, Number(event.target.value))
                          }
                          onBlur={() => onPrioritySave({ ...provider, priority })}
                        />
                      )}
                    </td>
                    <td className="text-left">
                      {isAi ? (
                        <AiProviderReadinessStatus provider={provider} />
                      ) : (
                        <span className={cn('provider-status', status.tone)}>
                          <span className="status-dot" aria-hidden="true" />
                          {status.label}
                        </span>
                      )}
                    </td>
                    <td className="text-left">
                      {provider.credentialConfigured ? '已配置' : '未配置'}
                    </td>
                    <StickyTableActionCell className="text-left">
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => onEdit(provider)}
                      >
                        编辑
                      </Button>
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        disabled={
                          testingProviderName !== null ||
                          savingProviderName !== null ||
                          deletingProviderName !== null
                        }
                        aria-busy={testingProviderName === provider.name}
                        onClick={() => onTest(provider)}
                      >
                        {testingProviderName === provider.name && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {providerTestActionLabel(testingProviderName === provider.name, isAi)}
                      </Button>
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        disabled={
                          testingProviderName !== null ||
                          savingProviderName !== null ||
                          deletingProviderName !== null
                        }
                        aria-busy={savingProviderName === provider.name}
                        onClick={() => onToggle(provider)}
                      >
                        {savingProviderName === provider.name && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {toggleLabel(savingProviderName === provider.name, provider.enabled)}
                      </Button>
                      {isAi && (
                        <Button
                          className="text-button danger"
                          size="sm"
                          type="button"
                          variant="link"
                          disabled={
                            testingProviderName !== null ||
                            savingProviderName !== null ||
                            deletingProviderName !== null
                          }
                          aria-busy={deletingProviderName === provider.name}
                          onClick={() => onDelete(provider)}
                        >
                          {deletingProviderName === provider.name && (
                            <LoaderCircle
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          删除
                        </Button>
                      )}
                    </StickyTableActionCell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const runNowLabel = (busy: boolean) => (busy ? '运行中…' : '立即运行');

export function AutomationTable({
  loadState,
  jobs,
  readError,
  reloading,
  onRetry,
  togglingJobId,
  runningJobId,
  deletingJobId = null,
  onToggle,
  onEdit,
  onRun,
  onDelete,
  onCreate,
}: {
  loadState: LoadState;
  jobs: AutomationJob[];
  readError?: boolean;
  reloading?: boolean;
  onRetry?: () => void;
  togglingJobId: string | null;
  runningJobId: string | null;
  deletingJobId?: string | null;
  onToggle: (job: AutomationJob) => void;
  onEdit: (job: AutomationJob) => void;
  onRun: (job: AutomationJob) => void;
  onDelete: (job: AutomationJob) => void;
  onCreate: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>自动化任务</h2>
          <p>启停、编辑与运行历史通过同一 API 管理。</p>
        </div>
        <Button size="sm" type="button" variant="default" onClick={onCreate}>
          新建任务
        </Button>
      </div>
      {readError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>任务列表暂未更新</AlertTitle>
          <AlertDescription>
            已成功保存的任务无需再次创建或保存。重新读取列表不会执行任务。
            <Button type="button" variant="outline" disabled={reloading} onClick={onRetry}>
              重新读取任务
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>类型（market 类休市日自动跳过）</th>
              <th>下一次运行</th>
              <th>状态</th>
              <StickyTableActionHeader>操作</StickyTableActionHeader>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && jobs.length === 0 ? (
              <EmptyTableRow colSpan={5} />
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    {job.name}
                    {job.managed ? (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        系统任务
                      </span>
                    ) : null}
                  </td>
                  <td>{automationJobTypeLabel(job.type)}</td>
                  <td>
                    {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString('zh-CN') : '未安排'}
                  </td>
                  <td>{job.enabled ? '启用' : '停用'}</td>
                  <StickyTableActionCell>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={readError || togglingJobId !== null}
                      aria-busy={togglingJobId === job.id}
                      onClick={() => onToggle(job)}
                    >
                      {togglingJobId === job.id && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {toggleLabel(togglingJobId === job.id, job.enabled)}
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={readError}
                      onClick={() => onEdit(job)}
                    >
                      编辑
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={readError || runningJobId !== null}
                      aria-busy={runningJobId === job.id}
                      onClick={() => onRun(job)}
                    >
                      {runningJobId === job.id && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {runNowLabel(runningJobId === job.id)}
                    </Button>
                    {!job.managed ? (
                      <Button
                        className="text-button danger"
                        size="sm"
                        variant="link"
                        disabled={readError || deletingJobId !== null}
                        aria-busy={deletingJobId === job.id}
                        onClick={() => onDelete(job)}
                      >
                        {deletingJobId === job.id ? '删除中…' : '删除'}
                      </Button>
                    ) : null}
                  </StickyTableActionCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const providerReadEmptyLabel = (state: LoadState | undefined, subject: string) => {
  if (state === 'loading') return `正在读取${subject}…`;
  if (state === 'error') return `${subject}读取失败，请重新读取。`;
  if (state === 'stale') return `${subject}更新失败，当前没有可显示记录。`;
  return `暂无${subject}。`;
};

export function HealthHistoryTable({
  loadState,
  history,
  loading,
  onPage,
  onRetry,
}: {
  loadState: LoadState;
  history: ProviderHealthHistoryPage;
  loading: boolean;
  onPage: (page: number) => void;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <section className="panel" aria-busy={loading}>
      <div className="panel-heading">
        <h2>提供方健康历史</h2>
        <p>显示状态、延迟、检查来源和时间，便于判断主备切换原因。</p>
      </div>
      {(loadState === 'error' || loadState === 'stale') && (
        <DataStateBanner state={loadState} {...(onRetry ? { onRetry } : {})} />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>提供方</th>
              <th>状态</th>
              <th>延迟</th>
              <th>检查时间</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {history.items.length === 0 ? (
              <EmptyTableRow colSpan={5} label={providerReadEmptyLabel(loadState, '健康历史')} />
            ) : (
              history.items.map((item, index) => (
                <tr key={`${item.provider}-${item.checkedAt}-${index}`}>
                  <td>{item.provider}</td>
                  <td>{providerHealthStateLabel(item.state)}</td>
                  <td>{item.latencyMs === null ? '不可用' : `${item.latencyMs} ms`}</td>
                  <td>{new Date(item.checkedAt).toLocaleString('zh-CN')}</td>
                  <td>{providerHealthSourceLabel(item.source)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {history.total > 0 && (
        <nav
          className="mt-3 flex flex-wrap items-center justify-between gap-3"
          aria-label="提供方健康历史分页"
        >
          <p className="m-0 text-sm text-muted-foreground">
            第 {history.page} / {history.totalPages} 页，共 {history.total} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={loadState === 'loading' || loading || history.page <= 1}
              onClick={() => onPage(history.page - 1)}
            >
              上一页
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={loadState === 'loading' || loading || history.page >= history.totalPages}
              onClick={() => onPage(history.page + 1)}
            >
              下一页
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}

function SimpleProviderTable({
  title,
  description,
  columns,
  rows,
  emptyColSpan,
  emptyState,
  footer,
  loadState,
  onRetry,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: Array<{ id: string; cells: string[] }>;
  emptyColSpan: number;
  emptyState?: ReactNode;
  footer?: ReactNode;
  loadState?: LoadState;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {(loadState === 'error' || loadState === 'stale') && (
        <DataStateBanner state={loadState} {...(onRetry ? { onRetry } : {})} />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? (emptyState ?? (
                  <EmptyTableRow
                    colSpan={emptyColSpan}
                    label={providerReadEmptyLabel(loadState, title)}
                  />
                ))
              : rows.map((row) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${index}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}

export function AutomationRunHistoryTable({
  loadState,
  jobs,
  history,
  loading,
  onPage,
}: {
  loadState: LoadState;
  jobs: AutomationJob[];
  history: AutomationHistoryPage;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const jobNames = new Map(jobs.map((job) => [job.id, job.name]));
  const automationJobName = (jobId: string) => jobNames.get(jobId) ?? jobId.slice(0, 8);
  let emptyState: ReactNode = <EmptyTableRow colSpan={5} />;
  if (loading || loadState === 'loading') {
    emptyState = <EmptyTableRow colSpan={5} label="正在读取自动化运行历史…" />;
  } else if (loadState === 'error') {
    emptyState = <EmptyTableRow colSpan={5} label="自动化运行历史读取失败，请重新加载。" />;
  } else if (loadState === 'stale') {
    emptyState = <EmptyTableRow colSpan={5} label="自动化运行历史更新失败，当前没有可显示记录。" />;
  }
  return (
    <SimpleProviderTable
      title="自动化运行历史"
      description="失败任务和错误摘要可从这里定位，无需直接查数据库。"
      columns={['任务', '状态', '开始时间', '运行结果', '错误']}
      emptyColSpan={5}
      emptyState={emptyState}
      footer={
        history.total > 0 ? (
          <nav
            className="mt-3 flex flex-wrap items-center justify-between gap-3"
            aria-label="自动化运行历史分页"
          >
            <p className="m-0 text-sm text-muted-foreground">
              第 {history.page} / {history.totalPages} 页，共 {history.total} 条
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={loadState === 'loading' || loading || history.page <= 1}
                onClick={() => onPage(history.page - 1)}
              >
                上一页
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={loadState === 'loading' || loading || history.page >= history.totalPages}
                onClick={() => onPage(history.page + 1)}
              >
                下一页
              </Button>
            </div>
          </nav>
        ) : null
      }
      rows={history.items.map((item) => ({
        id: item.id,
        cells: [
          automationJobName(item.jobId),
          automationRunStatusLabel(item.status),
          new Date(item.startedAt).toLocaleString('zh-CN'),
          automationOutputSummary(item.output),
          item.error ?? '—',
        ],
      }))}
    />
  );
}

export function NotificationFailuresTable({
  loadState,
  notificationFailures,
  onRetry,
}: {
  loadState: LoadState;
  notificationFailures: NotificationFailureRecord[];
  onRetry?: (() => void) | undefined;
}) {
  const normalizedState = isDataLoaded(loadState);
  return (
    <SimpleProviderTable
      title="通知失败"
      description="只读展示投递失败状态，重试仍通过 Notification API 处理。"
      columns={['提供方', '状态', '错误']}
      emptyColSpan={3}
      loadState={loadState}
      onRetry={onRetry}
      rows={
        normalizedState
          ? notificationFailures.map((item) => ({
              id: item.id,
              cells: [
                item.provider,
                notificationDeliveryStatusLabel(item.status),
                item.lastError ? notificationErrorCodeLabel(item.lastError) : '—',
              ],
            }))
          : []
      }
    />
  );
}

export function DataQualityIssuesTable({
  loadState,
  issues,
  onRetry,
}: {
  loadState: LoadState;
  issues: ProviderIssueRecord[];
  onRetry?: (() => void) | undefined;
}) {
  const normalizedState = isDataLoaded(loadState);
  return (
    <SimpleProviderTable
      title="开放数据质量问题"
      description="异常不会静默当作完整数据。"
      columns={['提供方', '标的', '级别', '问题']}
      emptyColSpan={4}
      loadState={loadState}
      onRetry={onRetry}
      rows={
        normalizedState
          ? issues.map((issue) => {
              const reason = dataQualityIssueReason(issue.details);
              return {
                id: issue.id,
                cells: [
                  issue.provider,
                  issue.symbol ?? '全局',
                  dataQualitySeverityLabel(issue.severity),
                  `${dataQualityCodeLabel(issue.code)}${reason ? `：${reason}` : ''}`,
                ],
              };
            })
          : []
      }
    />
  );
}
