import { LoadingState } from '@/components/ui/spinner';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterReset } from '@/components/ui/filter-bar';
import { BellOff, CircleAlert } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import type { LoadState } from '../shared/types.js';
import {
  formatDateTime,
  notificationRouteLabel,
  riskChannelLabel,
  riskEventMode,
  riskEventValueLabel,
  riskModeLabel,
  riskNotificationErrorLabel,
  riskRuleKindLabel,
  riskSeverityLabel,
  riskSeverityTone,
  riskStatusLabel,
  riskStatusTone,
  riskSubjectLabel,
  ruleTargetLabel,
} from './risk.format.js';
import type {
  RiskAuditRecord,
  RiskEventRecord,
  RiskRuleRecord,
  NotificationRecord,
  NotificationAvailability,
  PortfolioMode,
} from './risk.types.js';

export function NotificationProviderNotice({
  mode,
  availability,
  routingState,
  onConfigure,
}: {
  mode: PortfolioMode;
  availability: NotificationAvailability;
  routingState: 'loading' | 'ready' | 'error';
  onConfigure: () => void;
}) {
  // 路由仍在确认时不展示横幅，避免把加载中误报为“暂不可用”。
  if (mode === 'shadow' || routingState === 'loading' || availability === 'available') return null;
  if (availability === 'unknown') {
    return (
      <Alert className="border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
        <CircleAlert aria-hidden="true" />
        <AlertTitle className="text-foreground">通知提供方状态暂不可用</AlertTitle>
        <AlertDescription>
          暂时无法确认当前通知提供方。通知失败不会回滚已写入的风险事件。
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]">
      <BellOff aria-hidden="true" />
      <AlertTitle className="text-foreground">尚未配置可用的通知提供方</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>风险规则仍会执行并保留事件，但不会发送外部通知。</span>
        <Button type="button" size="sm" variant="outline" onClick={onConfigure}>
          配置通知提供方
        </Button>
      </AlertDescription>
    </Alert>
  );
}

const riskReadEmptyLabel = (state: LoadState, subject: string, filtered = false) => {
  if (state === 'loading') return `正在读取${subject}…`;
  if (state === 'error') return `${subject}读取失败，请重新读取。`;
  if (state === 'stale') return `${subject}更新失败，当前没有可显示记录。`;
  if (filtered) return `当前筛选下没有${subject}。`;
  return `暂无${subject}。`;
};

export function RiskEventTable({
  refreshing = false,
  loadState,
  events,
  severityFilter,
  limit,
  title,
  description,
  headerAction,
  onRetry,
}: {
  refreshing?: boolean;
  loadState: LoadState;
  events: RiskEventRecord[];
  severityFilter?: string | null;
  limit?: number | undefined;
  title?: string | undefined;
  description?: string | undefined;
  headerAction?: ReactNode | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const visibleEvents = severityFilter
    ? events.filter((event) => event.severity === severityFilter)
    : events;
  const empty = visibleEvents.length === 0;
  const eventDescription = description ?? eventTableDescription(severityFilter);

  return (
    <section className="panel mt-0 border-t-0">
      {(title || eventDescription || headerAction) && (
        <div className={cn('flex flex-wrap items-start justify-between gap-3', title ? 'panel-heading' : 'mb-group')}>
          {(title || eventDescription) && (
            <div>
              {title && <h2>{title}</h2>}
              {eventDescription && <p className="text-sm text-muted-foreground">{eventDescription}</p>}
            </div>
          )}
          {headerAction}
        </div>
      )}
      {(loadState === 'error' || loadState === 'stale') && (
        <DataStateBanner state={loadState} {...(onRetry ? { onRetry } : {})} />
      )}
      <TableContainer refreshing={refreshing} refreshLabel="正在刷新风险事件">
        <table>
          <TableHeader>
            <tr>
              <TableHead>事件</TableHead>
              <TableHead>级别</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>规则版本</TableHead>
              <TableHead>数据时间</TableHead>
            </tr>
          </TableHeader>
          <tbody>
            {empty ? (
              <EmptyTableRow colSpan={5} loading={loadState === 'loading'} label={riskReadEmptyLabel(loadState, '风险事件', Boolean(severityFilter))} />
            ) : (
              <RiskEventRows events={visibleEvents} limit={limit} />
            )}
          </tbody>
        </table>
      </TableContainer>
    </section>
  );
}

function eventTableDescription(severityFilter?: string | null) {
  if (severityFilter) return `当前筛选：${riskSeverityLabel(severityFilter)}。`;
  return null;
}

export function RiskEventRows({
  events,
  limit,
}: {
  events: RiskEventRecord[];
  limit?: number | undefined;
}) {
  const visibleEvents = limit === undefined ? events : events.slice(0, limit);
  return visibleEvents.map((event) => {
    const mode = riskEventMode(event);
    // 标题消息已含标的代码，副标题只展示格式化后的触发指标
    const valueLabel = riskEventValueLabel(event.context);
    return (
      <tr key={event.id}>
        <td>
          <strong>{event.message}</strong>
          {valueLabel ? <span>{valueLabel}</span> : null}
        </td>
        <td>
          <Badge variant={riskSeverityTone(event.severity)}>
            {riskSeverityLabel(event.severity)}
          </Badge>
        </td>
        <td>
          <Badge variant="outline">{mode ? riskModeLabel(mode) : '模式未知'}</Badge>
        </td>
        <td>v{event.ruleVersion}</td>
        <td>{formatDateTime(event.marketTime ?? event.evaluatedAt)}</td>
      </tr>
    );
  });
}

export function RiskNotificationTable({
  refreshing = false,
  loadState,
  deliveries,
  statusFilter,
  headerControls,
  onClearStatusFilter,
  onRetry,
}: {
  refreshing?: boolean;
  loadState: LoadState;
  deliveries: NotificationRecord[];
  statusFilter?: string | null;
  headerControls?: ReactNode;
  onClearStatusFilter?: () => void;
  onRetry?: (() => void) | undefined;
}) {
  const visibleDeliveries = statusFilter
    ? deliveries.filter((delivery) => delivery.status === statusFilter)
    : deliveries;
  const empty = visibleDeliveries.length === 0;

  return (
    <section className="panel mt-0 border-t-0">
      {headerControls}
      {statusFilter && (
        <div className="mb-group flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            当前筛选：{riskStatusLabel(statusFilter)}。
          </p>
          {onClearStatusFilter && <FilterReset size="xs" onReset={onClearStatusFilter} />}
        </div>
      )}
      {(loadState === 'error' || loadState === 'stale') && (
        <DataStateBanner state={loadState} {...(onRetry ? { onRetry } : {})} />
      )}
      <TableContainer refreshing={refreshing} refreshLabel="正在刷新通知记录">
        <table>
          <TableHeader>
            <tr>
              <TableHead>渠道</TableHead>
              <TableHead>级别</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">尝试次数</TableHead>
              <TableHead>最近尝试</TableHead>
            </tr>
          </TableHeader>
          <tbody>
            {empty ? (
              <EmptyTableRow colSpan={5} loading={loadState === 'loading'} label={riskReadEmptyLabel(loadState, '通知记录', Boolean(statusFilter))} />
            ) : (
              visibleDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <strong>
                      {delivery.provider ? notificationRouteLabel({ channel: delivery.channel, provider: delivery.provider }) : riskChannelLabel(delivery.channel)} ·{' '}
                      {riskSubjectLabel(delivery.subjectType)}
                    </strong>
                    {riskNotificationErrorLabel(delivery.lastError) ? (
                      <span>{riskNotificationErrorLabel(delivery.lastError)}</span>
                    ) : null}
                  </td>
                  <td>
                    <Badge variant={riskSeverityTone(delivery.severity)}>
                      {riskSeverityLabel(delivery.severity)}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={riskStatusTone(delivery.status)}>
                      {riskStatusLabel(delivery.status)}
                    </Badge>
                  </td>
                  <td className="text-right">{delivery.attemptCount}</td>
                  <td>{formatDateTime(delivery.scheduledAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableContainer>
    </section>
  );
}

const riskAuditActionLabels: Record<string, string> = {
  create: '创建',
  update: '修改',
  enable: '启用',
  disable: '停用',
  archive: '归档',
  restore: '恢复',
  test: '人工测试',
};

export function RiskAuditDialog({
  open,
  rule,
  accountName,
  audit,
  pending,
  error,
  onRetry,
  onOpenChange,
}: {
  open: boolean;
  rule: RiskRuleRecord | null;
  accountName?: string;
  audit: RiskAuditRecord[];
  pending: boolean;
  error: boolean;
  onRetry?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const auditDescription = rule
    ? `${riskRuleKindLabel(rule.kind)} · ${ruleTargetLabel(rule, accountName, rule.assetName)}`
    : '查看规则版本与操作时间。';
  let content: ReactNode = <EmptyListState />;
  if (pending) content = <LoadingState label="正在读取审计记录" />;
  else if (error)
    content = (
      <Alert variant="destructive">
        <AlertTitle>审计记录读取失败</AlertTitle>
        <AlertDescription>当前规则与输入保留，请重新读取。</AlertDescription>
        {onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            重新读取审计
          </Button>
        )}
      </Alert>
    );
  else if (audit.length > 0) {
    content = (
      <div className="flex max-h-[min(60dvh,480px)] flex-col gap-3 overflow-auto">
        {audit.map((item) => {
          const before = formatAuditSnapshot(item.before);
          const after = formatAuditSnapshot(item.after);
          return (
            <div key={item.id} className="rounded-md bg-muted/40 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span title={item.action}>
                  {riskAuditActionLabels[item.action] ?? '其他操作'} · v{item.ruleVersion}
                </span>
                <small className="text-muted-foreground">{formatDateTime(item.createdAt)}</small>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline font-medium">操作人：</dt>
                  <dd className="inline">{item.actor ?? '暂无'}</dd>
                </div>
              </dl>
              <AuditSnapshots before={before} after={after} />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-64px)] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>审计记录</DialogTitle>
          <DialogDescription>{auditDescription}</DialogDescription>
        </DialogHeader>
        {content}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" className="secondary" />}>
            关闭
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatAuditSnapshot(snapshot: Record<string, unknown> | null | undefined) {
  if (!snapshot) return null;
  try {
    return JSON.stringify(snapshot, null, 2) ?? '暂无快照';
  } catch {
    return '快照暂不可读';
  }
}

function AuditSnapshot({
  label,
  value,
  open,
  onToggle,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1 text-left text-xs font-medium"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span aria-hidden="true">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {value ?? '暂无快照'}
        </pre>
      )}
    </div>
  );
}

// 修改前/修改后是一对对照快照，展开状态同步：点任意一个，两个一起展开或收起
function AuditSnapshots({ before, after }: { before: string | null; after: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <AuditSnapshot
        label="修改前快照"
        value={before}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      />
      <AuditSnapshot
        label="修改后快照"
        value={after}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      />
    </div>
  );
}
