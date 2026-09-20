import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  strategyRiskNotificationSeverityLabel,
  strategyRiskNotificationSeverityOptions,
} from '../strategy/strategy-display-labels.js';
import type {
  RiskApplicationUpgradePreview,
  StrategyRiskApplication,
  StrategyRiskNotification,
} from '../strategy/strategy-optimization.api.js';
import type { StrategyVersion } from '../strategy/strategy.types.js';
import { NotificationRouteSelect } from './NotificationRouteSelect.js';
import { useNotificationRoutingQuery } from './risk.queries.js';

const riskRuleChangeLabel = (change: RiskApplicationUpgradePreview['diff'][number]['change']) => {
  if (change === 'added') return '新增规则';
  if (change === 'removed') return '移除规则';
  return '规则变化';
};

export function RiskApplicationNotificationEditor({
  application,
  pending,
  onSave,
}: {
  application: StrategyRiskApplication;
  pending: boolean;
  onSave: (notification: StrategyRiskNotification) => void;
}) {
  const [enabled, setEnabled] = useState(application.notification.enabled);
  const [severity, setSeverity] = useState(application.notification.severity);
  const [cooldown, setCooldown] = useState(String(application.notification.cooldownMinutes));
  const [channel, setChannel] = useState<string>(application.notification.channels[0] ?? '');
  const notificationRouting = useNotificationRoutingQuery();
  const routes = notificationRouting.data?.routes ?? [];
  let routingState: 'loading' | 'ready' | 'error' = 'ready';
  if (notificationRouting.isPending) routingState = 'loading';
  else if (notificationRouting.isError) routingState = 'error';
  const selectedRoute = routes.find((route) => route.channel === channel);
  useEffect(() => {
    setEnabled(application.notification.enabled);
    setSeverity(application.notification.severity);
    setCooldown(String(application.notification.cooldownMinutes));
    setChannel(application.notification.channels[0] ?? '');
  }, [application.notification, application.revision]);
  const cooldownValue = Number(cooldown);
  const validCooldown =
    Number.isInteger(cooldownValue) && cooldownValue >= 0 && cooldownValue <= 10_080;
  const dirty =
    enabled !== application.notification.enabled ||
    severity !== application.notification.severity ||
    cooldown !== String(application.notification.cooldownMinutes) ||
    channel !== application.notification.channels[0];
  const notificationValid = !enabled || Boolean(selectedRoute);

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">通知配置</div>
          <div className="text-xs text-muted-foreground">修改通知不会改变应用身份或绑定版本。</div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!enabled && !selectedRoute}
          variant="risk"
          aria-label="策略风险应用通知"
        >
          <SwitchThumb variant="risk" aria-hidden="true" />
        </Switch>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(10rem,0.75fr)_minmax(13rem,1fr)_minmax(13rem,1fr)]">
        <Field>
          <FieldLabel>严重级别</FieldLabel>
          <Select value={severity} onValueChange={(value) => value && setSeverity(value)}>
            <SelectTrigger aria-label="策略应用通知严重级别" className="w-full">
              <SelectValue>{strategyRiskNotificationSeverityLabel(severity)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {strategyRiskNotificationSeverityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>冷却时间（分钟）</FieldLabel>
          <Input
            type="number"
            min="0"
            max="10080"
            value={cooldown}
            onChange={(event) => setCooldown(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>通知渠道</FieldLabel>
          <NotificationRouteSelect
            routes={routes}
            routingState={routingState}
            value={channel}
            onValueChange={setChannel}
            ariaLabel="策略应用通知渠道"
          />
        </Field>
      </div>
      {!validCooldown ? (
        <p className="text-xs text-destructive">冷却时间必须是 0 到 10080 的整数。</p>
      ) : null}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || !validCooldown || !notificationValid || pending}
          onClick={() =>
            onSave({
              enabled,
              severity,
              cooldownMinutes: cooldownValue,
              channels:
                enabled && selectedRoute
                  ? [selectedRoute.channel as StrategyRiskNotification['channels'][number]]
                  : [],
            })
          }
        >
          保存通知配置
        </Button>
      </div>
    </div>
  );
}

export function RiskApplicationUpgradeReview({
  application,
  targetVersion,
  preview,
  pending,
  onConfirm,
  onOpenExisting,
}: {
  application: StrategyRiskApplication;
  targetVersion: StrategyVersion;
  preview: RiskApplicationUpgradePreview;
  pending: boolean;
  onConfirm: () => void;
  onOpenExisting: (applicationId: string) => void;
}) {
  const changes = preview.diff.filter((item) => item.change !== 'unchanged');
  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div>
        <div className="font-medium">升级预览：目标 v{targetVersion.version}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          当前应用继续绑定原版本，只有确认后才更新。通知配置与启用状态保持不变。
        </p>
      </div>
      <div className="space-y-2">
        {changes.map((item) => (
          <div key={item.sourceKey} className="rounded border bg-background p-2 text-xs">
            <span className="font-medium">{item.sourceKey}</span>
            <span className="ml-2 text-muted-foreground">{riskRuleChangeLabel(item.change)}</span>
          </div>
        ))}
        {changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">目标版本的监控规则没有变化。</p>
        ) : null}
      </div>
      {preview.targetApplication ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-3 text-sm">
          <span>目标版本已有同源应用，系统不会覆盖或新增重复记录。</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenExisting(preview.targetApplication!.id)}
          >
            查看已有应用
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? '正在升级…' : `确认升级到 v${targetVersion.version}`}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        当前来源版本 ID：{application.strategyVersionId}
      </p>
    </div>
  );
}
