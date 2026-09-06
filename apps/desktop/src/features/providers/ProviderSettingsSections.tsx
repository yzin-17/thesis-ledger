import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import { EmptyTableRow } from '../shared/EmptyStates.js';
import { isDataLoaded } from '../shared/display.js';
import type { LoadState } from '../shared/types.js';
import {
  automationJobTypeLabel,
  automationRunStatusLabel,
  dataQualitySeverityLabel,
  notificationDeliveryStatusLabel,
  notificationErrorCodeLabel,
  providerCapabilityLabel,
  providerDisplayStatus,
  providerHealthSourceLabel,
  providerHealthStateLabel,
  providerTypeLabel,
} from './providers.types.js';
import type {
  AutomationHistoryRecord,
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

export function ProviderTable({
  loadState,
  providers,
  priorityDrafts,
  testingProviderName,
  savingProviderName,
  onPriorityChange,
  onPrioritySave,
  onEdit,
  onTest,
  onToggle,
}: {
  loadState: LoadState;
  providers: ProviderRecord[];
  priorityDrafts: Record<string, number>;
  testingProviderName: string | null;
  savingProviderName: string | null;
  onPriorityChange: (name: string, value: number) => void;
  onPrioritySave: (provider: ProviderRecord) => void;
  onEdit: (provider: ProviderRecord) => void;
  onTest: (name: string) => void;
  onToggle: (provider: ProviderRecord) => void;
}) {
  return (
    <section className="panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="text-center first:text-center">提供方</th>
              <th className="text-center">能力</th>
              <th className="text-center">优先级</th>
              <th className="text-center">状态</th>
              <th className="text-center">凭证</th>
              <th className="text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && providers.length === 0 ? (
              <EmptyTableRow colSpan={6} />
            ) : (
              providers.map((provider) => {
                const status = providerDisplayStatus(provider);
                const priority = priorityDrafts[provider.name] ?? provider.priority;
                return (
                  <tr key={provider.name}>
                    <td className="text-left first:text-left">
                      <strong>{provider.name}</strong>
                      <span>{providerTypeLabel(provider.type)}</span>
                    </td>
                    <td className="text-left">
                      {provider.capabilities.map(providerCapabilityLabel).join(' · ')}
                    </td>
                    <td className="text-left">
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
                    </td>
                    <td className="text-left">
                      <span className={cn('provider-status', status.tone)}>
                        <span className="status-dot" aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td className="text-left">
                      {provider.credentialConfigured ? '已配置' : '未配置'}
                    </td>
                    <td className="text-left">
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
                        disabled={testingProviderName !== null || savingProviderName !== null}
                        aria-busy={testingProviderName === provider.name}
                        onClick={() => onTest(provider.name)}
                      >
                        {testingProviderName === provider.name && (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {testingProviderName === provider.name ? '测试中…' : '连通性测试'}
                      </Button>
                      <Button
                        className="text-button"
                        size="sm"
                        type="button"
                        variant="link"
                        disabled={testingProviderName !== null || savingProviderName !== null}
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
                    </td>
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
  togglingJobId,
  runningJobId,
  onToggle,
  onEdit,
  onRun,
  onDelete,
  onCreate,
}: {
  loadState: LoadState;
  jobs: AutomationJob[];
  togglingJobId: string | null;
  runningJobId: string | null;
  onToggle: (job: AutomationJob) => void;
  onEdit: (job: AutomationJob) => void;
  onRun: (job: AutomationJob) => void;
  onDelete: (job: AutomationJob) => void;
  onCreate: () => void;
}) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="panel-heading">
          <h2>自动化任务</h2>
          <p>启停、编辑与运行历史通过同一 API 管理。</p>
        </div>
        <Button size="sm" type="button" variant="default" onClick={onCreate}>
          新建任务
        </Button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>类型（market 类休市日自动跳过）</th>
              <th>下一次运行</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && jobs.length === 0 ? (
              <EmptyTableRow colSpan={5} />
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.name}</td>
                  <td>{automationJobTypeLabel(job.type)}</td>
                  <td>
                    {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString('zh-CN') : '未安排'}
                  </td>
                  <td>{job.enabled ? '启用' : '停用'}</td>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={togglingJobId !== null}
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
                      onClick={() => onEdit(job)}
                    >
                      编辑
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={runningJobId !== null}
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
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      onClick={() => onDelete(job)}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HealthHistoryTable({
  loadState,
  history,
  loading,
  onPage,
}: {
  loadState: LoadState;
  history: ProviderHealthHistoryPage;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Provider 健康历史</h2>
        <p>显示状态、延迟、检查来源和时间，便于判断主备切换原因。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>状态</th>
              <th>延迟</th>
              <th>检查时间</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && history.items.length === 0 ? (
              <EmptyTableRow colSpan={5} />
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
          aria-label="Provider 健康历史分页"
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
}: {
  title: string;
  description: string;
  columns: string[];
  rows: Array<{ id: string; cells: string[] }>;
  emptyColSpan: number;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
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
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={emptyColSpan} />
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`}>{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProviderHistoryTables({
  loadState,
  jobs,
  jobHistory,
  notificationFailures,
  issues,
}: {
  loadState: LoadState;
  jobs: AutomationJob[];
  jobHistory: AutomationHistoryRecord[];
  notificationFailures: NotificationFailureRecord[];
  issues: ProviderIssueRecord[];
}) {
  const normalizedState = isDataLoaded(loadState);
  const jobNames = new Map(jobs.map((job) => [job.id, job.name]));
  const automationJobName = (jobId: string) => jobNames.get(jobId) ?? jobId.slice(0, 8);
  return (
    <>
      <SimpleProviderTable
        title="自动化运行历史"
        description="失败任务和错误摘要可从这里定位，无需直接查数据库。"
        columns={['任务', '状态', '开始时间', '错误']}
        emptyColSpan={4}
        rows={
          normalizedState
            ? jobHistory.map((item) => ({
                id: item.id,
                cells: [
                  automationJobName(item.jobId),
                  automationRunStatusLabel(item.status),
                  new Date(item.startedAt).toLocaleString('zh-CN'),
                  item.error ?? '—',
                ],
              }))
            : []
        }
      />
      <SimpleProviderTable
        title="通知失败"
        description="只读展示投递失败状态，重试仍通过 Notification API 处理。"
        columns={['Provider', '状态', '错误']}
        emptyColSpan={3}
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
      <SimpleProviderTable
        title="开放数据质量问题"
        description="异常不会静默当作完整数据。"
        columns={['Provider', '标的', '级别', '问题']}
        emptyColSpan={4}
        rows={
          normalizedState
            ? issues.map((issue) => ({
                id: issue.id,
                cells: [
                  issue.provider,
                  issue.symbol ?? '全局',
                  dataQualitySeverityLabel(issue.severity),
                  issue.code,
                ],
              }))
            : []
        }
      />
    </>
  );
}
