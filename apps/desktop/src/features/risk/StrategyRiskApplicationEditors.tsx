import { Spinner } from '@/components/ui/spinner';
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
import { NotificationProviderSelect } from './NotificationProviderSelect.js';
import { useRiskNotificationRoutingQuery } from './risk.queries.js';
import { StrategyRiskRuleSettings } from '../strategy/StrategyRiskRuleSettings.js';
import {
  buildRiskNotification,
  ruleNotificationDrafts,
} from '../strategy/strategy-risk-notification-form.js';

const riskRuleChangeLabel = (change: RiskApplicationUpgradePreview['diff'][number]['change']) => {
  if (change === 'added') return '新增规则';
  if (change === 'removed') return '移除规则';
  return '规则变化';
};

export function RiskApplicationNotificationEditor(props: {
  application: StrategyRiskApplication;
  pending: boolean;
  onSave: (notification: StrategyRiskNotification) => void;
}) {
  const control = useRiskApplicationNotificationEditor(props);
  const {
    enabled,
    setEnabled,
    pending,
    selectedRoute,
    severity,
    setSeverity,
    cooldown,
    setCooldown,
    routes,
    routingState,
    selectedProviders,
    setProviders,
    notificationRouting,
    application,
    ruleDrafts,
    setRuleDrafts,
    validCooldown,
    dirty,
    notificationValid,
    notification,
    onSave,
  } = control;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">通知配置</div>
          <div className="text-xs text-muted-foreground">修改通知不会改变应用身份或绑定版本。</div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={pending || (!enabled && !selectedRoute)}
          variant="risk"
          aria-label="策略风险应用通知"
        >
          <SwitchThumb variant="risk" aria-hidden="true" />
        </Switch>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(10rem,0.75fr)_minmax(13rem,1fr)_minmax(13rem,1fr)]">
        <Field>
          <FieldLabel>默认严重级别</FieldLabel>
          <Select
            value={severity}
            disabled={pending}
            onValueChange={(value) => value && setSeverity(value)}
          >
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
          <FieldLabel>默认冷却时间（分钟）</FieldLabel>
          <Input
            type="number"
            min="0"
            max="10080"
            value={cooldown}
            disabled={pending}
            onChange={(event) => setCooldown(event.target.value)}
          />
        </Field>
        <NotificationProviderSelect
          routes={routes}
          state={routingState}
          value={selectedProviders}
          onChange={setProviders}
          disabled={pending}
          onRetry={() => void notificationRouting.refetch()}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        单条规则可覆盖默认值；冷却时间留空时继承默认值，0 表示不等待。
      </p>
      <div className="flex min-w-0 flex-col divide-y divide-border">
        {application.plan.rules.map((rule) => (
          <section
            key={rule.sourceKey}
            aria-label={`${rule.label}通知设置`}
            className="flex min-w-0 flex-col gap-3 py-4"
          >
            <h4 className="text-sm font-medium">{rule.label}</h4>
            <StrategyRiskRuleSettings
              rule={rule}
              value={ruleDrafts[rule.sourceKey]}
              defaults={{ severity, cooldownMinutes: cooldown }}
              disabled={pending}
              onChange={(value) =>
                setRuleDrafts((current) => ({ ...current, [rule.sourceKey]: value }))
              }
            />
          </section>
        ))}
      </div>
      {!validCooldown ? (
        <p className="text-xs text-destructive">冷却时间必须是 0 到 10080 的整数。</p>
      ) : null}
      <div className="flex justify-end">
        <Button
          aria-busy={pending}
          size="sm"
          disabled={!dirty || !validCooldown || !notificationValid || pending}
          onClick={() => notification && onSave(notification)}
        >
          {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          保存通知配置
        </Button>
      </div>
    </div>
  );
}

function useRiskApplicationNotificationEditor({
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
  const [providers, setProviders] = useState<string[] | undefined>(
    application.notification.providers,
  );
  const [ruleDrafts, setRuleDrafts] = useState(() =>
    ruleNotificationDrafts(application.notification),
  );
  const notificationRouting = useRiskNotificationRoutingQuery();
  const routes = notificationRouting.data?.availableRoutes ?? [];
  const selectedProviders = providers ?? notificationRouting.data?.selectedProviders ?? [];
  let routingState: 'loading' | 'ready' | 'error' = 'ready';
  if (notificationRouting.isPending) routingState = 'loading';
  else if (notificationRouting.isError) routingState = 'error';
  const selectedRoute =
    selectedProviders.length > 0 &&
    selectedProviders.every((name) => routes.some((route) => route.provider === name));
  useEffect(() => {
    setEnabled(application.notification.enabled);
    setSeverity(application.notification.severity);
    setCooldown(String(application.notification.cooldownMinutes));
    setProviders(application.notification.providers);
    setRuleDrafts(ruleNotificationDrafts(application.notification));
  }, [application.notification, application.revision]);
  let notification: StrategyRiskNotification | null = null;
  try {
    notification = buildRiskNotification(
      { enabled, severity, cooldownMinutes: cooldown, channel: '', providers: selectedProviders },
      ruleDrafts,
    );
  } catch {
    /* 字段错误保留输入。 */
  }
  const validCooldown = notification !== null;
  const dirty =
    enabled !== application.notification.enabled ||
    severity !== application.notification.severity ||
    cooldown !== String(application.notification.cooldownMinutes) ||
    JSON.stringify(providers) !== JSON.stringify(application.notification.providers) ||
    JSON.stringify(ruleDrafts) !== JSON.stringify(ruleNotificationDrafts(application.notification));
  const notificationValid = !enabled || Boolean(selectedRoute);

  return {
    enabled,
    setEnabled,
    pending,
    selectedRoute,
    severity,
    setSeverity,
    cooldown,
    setCooldown,
    routes,
    routingState,
    selectedProviders,
    setProviders,
    notificationRouting,
    application,
    ruleDrafts,
    setRuleDrafts,
    validCooldown,
    dirty,
    notificationValid,
    notification,
    onSave,
  };
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
          <Button aria-busy={pending} disabled={pending} onClick={onConfirm}>
            {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
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
