import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { displayValue, isDataLoaded } from '../shared/display.js';
import { EmptyListState, EmptyTableRow } from '../shared/EmptyStates.js';
import { Metric } from '../shared/DesktopPrimitives.js';
import type { LoadState } from '../shared/types.js';
import type {
  RiskAuditRecord,
  RiskEventRecord,
  RiskRuleRecord,
  NotificationRecord,
} from './risk.types.js';

const riskRuleKindLabel = (value: string | null) => {
  const labels: Record<string, string> = {
    'price-above': '价格高于',
    'cost-stop': '成本止损',
    'take-profit': '止盈',
    'position-concentration': '持仓集中度',
    'price-below': '价格低于',
  };
  return labels[value ?? ''] ?? '价格低于';
};

const riskScopeLabel = (value: string | null) => {
  if (value === 'account') return '账户';
  if (value === 'portfolio') return '组合';
  return '证券';
};

const riskSeverityLabel = (value: string | null) => {
  if (value === 'info') return '提示';
  if (value === 'error') return '错误';
  if (value === 'critical') return '严重';
  return '警告';
};

const riskRuleActionLabel = (enabled: boolean, busy: boolean) => {
  if (busy) return enabled ? '停用中…' : '启用中…';
  return enabled ? '停用' : '启用';
};

export function RiskSummary({
  rules,
  events,
  deliveries,
}: {
  rules: RiskRuleRecord[];
  events: RiskEventRecord[];
  deliveries: NotificationRecord[];
}) {
  const criticalCount = events.filter((event) => event.severity === 'critical').length;
  const failedCount = deliveries.filter((delivery) => delivery.status === 'failed').length;
  return (
    <div className="metrics">
      <Metric label="启用规则" value={String(rules.filter((rule) => rule.enabled).length)} />
      <Metric
        label="严重事件"
        value={String(criticalCount)}
        {...(criticalCount ? { tone: 'negative' as const } : {})}
      />
      <Metric
        label="通知失败"
        value={String(failedCount)}
        {...(failedCount ? { tone: 'negative' as const } : {})}
      />
    </div>
  );
}

export function RiskRuleForm({
  accounts,
  busyAction,
  onSubmit,
  onScan,
}: {
  accounts: Account[];
  busyAction: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onScan: () => void;
}) {
  return (
    <form className="form-card risk-form" onSubmit={onSubmit}>
      <h3>新建规则</h3>
      <label>
        类型
        <Select name="kind" defaultValue="price-below">
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string | null) => riskRuleKindLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="price-below">价格低于</SelectItem>
              <SelectItem value="price-above">价格高于</SelectItem>
              <SelectItem value="cost-stop">成本止损</SelectItem>
              <SelectItem value="take-profit">止盈</SelectItem>
              <SelectItem value="position-concentration">持仓集中度</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label>
        范围
        <Select name="scope" defaultValue="security">
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string | null) => riskScopeLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="security">证券</SelectItem>
              <SelectItem value="account">账户</SelectItem>
              <SelectItem value="portfolio">组合</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label>
        阈值
        <Input name="threshold" type="number" step="any" required />
      </label>
      <label>
        严重级别
        <Select name="severity" defaultValue="warning">
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string | null) => riskSeverityLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="info">提示</SelectItem>
              <SelectItem value="warning">警告</SelectItem>
              <SelectItem value="error">错误</SelectItem>
              <SelectItem value="critical">严重</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label>
        证券代码
        <Input name="symbol" placeholder="security 时填写" />
      </label>
      <label>
        账户
        <Select name="accountId" defaultValue={null}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="account 时选择">
              {(value: string | null) =>
                accounts.find((account) => account.id === value)?.name ?? 'account 时选择'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <Button disabled={busyAction !== null} type="submit" variant="default">
        {busyAction === 'create-rule' && (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        )}
        {busyAction === 'create-rule' ? '创建中…' : '创建规则'}
      </Button>
      <Button
        className="secondary"
        type="button"
        variant="outline"
        disabled={busyAction !== null}
        aria-busy={busyAction === 'scan-risk'}
        onClick={onScan}
      >
        {busyAction === 'scan-risk' && (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        )}
        {busyAction === 'scan-risk' ? '扫描中…' : '扫描当前组合'}
      </Button>
    </form>
  );
}

export function RiskRuleTable({
  loadState,
  rules,
  busyAction,
  onPatch,
  onTest,
  onAudit,
  onDelete,
}: {
  loadState: LoadState;
  rules: RiskRuleRecord[];
  busyAction: string | null;
  onPatch: (rule: RiskRuleRecord) => void;
  onTest: (rule: RiskRuleRecord) => void;
  onAudit: (rule: RiskRuleRecord) => void;
  onDelete: (rule: RiskRuleRecord) => void;
}) {
  const empty = isDataLoaded(loadState) && rules.length === 0;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>规则列表</h2>
        <p>修改与启停都会递增版本并写入审计。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>规则</th>
              <th>范围</th>
              <th>阈值</th>
              <th>版本</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <EmptyTableRow colSpan={5} />
            ) : (
              rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.kind}</strong>
                    <span>{rule.symbol ?? rule.accountId ?? '全组合'}</span>
                  </td>
                  <td>{rule.scope}</td>
                  <td>{rule.threshold}</td>
                  <td>v{rule.version}</td>
                  <td>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `patch:${rule.id}`}
                      onClick={() => onPatch(rule)}
                    >
                      {busyAction === `patch:${rule.id}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {riskRuleActionLabel(rule.enabled, busyAction === `patch:${rule.id}`)}
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `test:${rule.id}`}
                      onClick={() => onTest(rule)}
                    >
                      {busyAction === `test:${rule.id}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {busyAction === `test:${rule.id}` ? '测试中…' : '测试'}
                    </Button>
                    <Button
                      className="text-button"
                      size="sm"
                      variant="link"
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `audit:${rule.id}`}
                      onClick={() => onAudit(rule)}
                    >
                      {busyAction === `audit:${rule.id}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {busyAction === `audit:${rule.id}` ? '读取中…' : '变更记录'}
                    </Button>
                    <Button
                      className="text-button danger"
                      size="sm"
                      variant="destructive"
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `delete:${rule.id}`}
                      onClick={() => onDelete(rule)}
                    >
                      {busyAction === `delete:${rule.id}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {busyAction === `delete:${rule.id}` ? '删除中…' : '删除'}
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
    ? `${rule.kind} · ${rule.symbol ?? rule.accountId ?? '全组合'}`
    : '查看规则版本与操作时间。';
  let auditContent: ReactNode = <EmptyListState />;
  if (pending) auditContent = <p role="status">正在读取审计记录…</p>;
  else if (error) auditContent = <p role="alert">审计记录读取失败，请稍后重试。</p>;
  else if (audit.length > 0) {
    auditContent = (
      <div className="edit-list">
        {audit.map((item) => (
          <div key={item.id}>
            <span>
              {item.action} · v{item.ruleVersion}
            </span>
            <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
          </div>
        ))}
      </div>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-64px)] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>变更记录</DialogTitle>
          <DialogDescription>{auditDescription}</DialogDescription>
        </DialogHeader>
        {auditContent}
        <DialogFooter>
          <DialogClose render={<Button className="secondary" type="button" variant="outline" />}>
            关闭
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiskEventTable({
  loadState,
  events,
}: {
  loadState: LoadState;
  events: RiskEventRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>历史事件</h2>
        <p>显示实际触发值的数据时间与规则版本。</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>事件</th>
              <th>级别</th>
              <th>规则版本</th>
              <th>数据时间</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && events.length === 0 ? (
              <EmptyTableRow colSpan={4} />
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.message}</strong>
                    <span>
                      {event.symbol ?? '组合'} · value={displayValue(event.context.value)}
                    </span>
                  </td>
                  <td>{event.severity}</td>
                  <td>v{event.ruleVersion}</td>
                  <td>{new Date(event.marketTime ?? event.evaluatedAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RiskNotificationTable({
  loadState,
  deliveries,
}: {
  loadState: LoadState;
  deliveries: NotificationRecord[];
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>通知状态</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>渠道</th>
              <th>级别</th>
              <th>状态</th>
              <th>尝试</th>
            </tr>
          </thead>
          <tbody>
            {isDataLoaded(loadState) && deliveries.length === 0 ? (
              <EmptyTableRow colSpan={4} />
            ) : (
              deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <strong>{delivery.channel}</strong>
                    <span>{delivery.lastError ?? delivery.eventId}</span>
                  </td>
                  <td>{delivery.severity}</td>
                  <td>{delivery.status}</td>
                  <td>{delivery.attemptCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
