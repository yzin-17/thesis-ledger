import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

import { displayValue, isDataLoaded } from '../shared/display.js';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import type { LoadState } from '../shared/types.js';
import {
  formatDateTime,
  riskChannelLabel,
  riskEventMode,
  riskModeLabel,
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
  NotificationRouteRecord,
} from './risk.types.js';

export function RiskEventTable({
  loadState,
  events,
  severityFilter,
  limit,
  title = '风险事件',
  description,
  headerAction,
}: {
  loadState: LoadState;
  events: RiskEventRecord[];
  severityFilter?: string | null;
  limit?: number | undefined;
  title?: string | undefined;
  description?: string | undefined;
  headerAction?: ReactNode | undefined;
}) {
  const visibleEvents = severityFilter
    ? events.filter((event) => event.severity === severityFilter)
    : events;
  const empty = isDataLoaded(loadState) && visibleEvents.length === 0;

  return (
    <section className="panel mt-0">
      <div className="panel-heading flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>{title}</h2>
          <p>{description ?? eventTableDescription(severityFilter)}</p>
        </div>
        {headerAction}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>事件</th>
              <th>级别</th>
              <th>模式</th>
              <th>规则版本</th>
              <th>数据时间</th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <EmptyTableRow colSpan={5} />
            ) : (
              <RiskEventRows events={visibleEvents} limit={limit} />
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function eventTableDescription(severityFilter?: string | null) {
  if (severityFilter) return `当前筛选：${riskSeverityLabel(severityFilter)}。`;
  return '保留触发时的规则版本、数据时间和上下文。';
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
    return (
      <tr key={event.id}>
        <td>
          <strong>{event.message}</strong>
          <span>
            {event.symbol ?? '组合'} · value={displayValue(event.context.value)}
          </span>
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
  loadState,
  deliveries,
  statusFilter,
  routes,
  routingState,
  onConfigure,
}: {
  loadState: LoadState;
  deliveries: NotificationRecord[];
  statusFilter?: string | null;
  routes: NotificationRouteRecord[];
  routingState: 'loading' | 'ready' | 'error';
  onConfigure: () => void;
}) {
  const visibleDeliveries = statusFilter
    ? deliveries.filter((delivery) => delivery.status === statusFilter)
    : deliveries;
  const empty = isDataLoaded(loadState) && visibleDeliveries.length === 0;
  let routingDescription = '正在确认通知 Provider…';
  if (routingState === 'error') routingDescription = '暂时无法确认当前通知 Provider。';
  else if (routes.length > 0) {
    routingDescription = `当前按 Provider 配置投递到：${routes
      .map((route) => `${route.provider}（${riskChannelLabel(route.channel)}）`)
      .join('、')}。`;
  } else if (routingState === 'ready') {
    routingDescription = '当前没有可投递的通知 Provider。';
  }

  return (
    <section className="panel mt-0">
      <div className="panel-heading">
        <h2>通知状态</h2>
        <p>
          {statusFilter
            ? `当前筛选：${riskStatusLabel(statusFilter)}。`
            : `${routingDescription} 通知失败不会回滚已写入的风险事件。`}
        </p>
      </div>
      {routingState === 'ready' && routes.length === 0 ? (
        <Alert className="mb-4">
          <BellOff aria-hidden="true" />
          <AlertTitle>尚未配置可用的通知 Provider</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>风险事件仍会保留，但不会发送外部通知。</span>
            <Button type="button" size="sm" variant="outline" onClick={onConfigure}>
              配置通知 Provider
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {routingState === 'error' ? (
        <Alert className="mb-4">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>通知 Provider 状态暂不可用</AlertTitle>
          <AlertDescription>无法确认当前投递去向，请刷新后重试。</AlertDescription>
        </Alert>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>渠道</th>
              <th>级别</th>
              <th>状态</th>
              <th>尝试次数</th>
              <th>最近尝试</th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <EmptyTableRow colSpan={5} />
            ) : (
              visibleDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <strong>
                      {riskChannelLabel(delivery.channel)} ·{' '}
                      {riskSubjectLabel(delivery.subjectType)}
                    </strong>
                    <span>{delivery.lastError ?? `主题 ${delivery.subjectId}`}</span>
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
                  <td>{delivery.attemptCount}</td>
                  <td>{formatDateTime(delivery.scheduledAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RiskAuditDialog({
  open,
  rule,
  audit,
  pending,
  error,
  onOpenChange,
}: {
  open: boolean;
  rule: RiskRuleRecord | null;
  audit: RiskAuditRecord[];
  pending: boolean;
  error: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const auditDescription = rule
    ? `${rule.kind} · ${ruleTargetLabel(rule)}`
    : '查看规则版本与操作时间。';
  let content: ReactNode = <EmptyListState />;
  if (pending) content = <p role="status">正在读取审计记录…</p>;
  else if (error) content = <p role="alert">审计记录读取失败，请稍后重试。</p>;
  else if (audit.length > 0) {
    content = (
      <div className="flex max-h-[min(60dvh,480px)] flex-col gap-3 overflow-auto">
        {audit.map((item) => {
          const before = formatAuditSnapshot(item.before);
          const after = formatAuditSnapshot(item.after);
          return (
            <div key={item.id} className="rounded-md bg-muted/40 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {item.action} · v{item.ruleVersion}
                </span>
                <small className="text-muted-foreground">{formatDateTime(item.createdAt)}</small>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline font-medium">操作人：</dt>
                  <dd className="inline">{item.actor ?? '暂无'}</dd>
                </div>
              </dl>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <AuditSnapshot label="修改前快照" value={before} />
                <AuditSnapshot label="修改后快照" value={after} />
              </div>
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

function AuditSnapshot({ label, value }: { label: string; value: string | null }) {
  return (
    <details className="rounded-md border border-border bg-background p-2">
      <summary className="cursor-pointer text-xs font-medium">{label}</summary>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {value ?? '暂无快照'}
      </pre>
    </details>
  );
}
