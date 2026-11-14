import { Bell, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';
import type { NotificationRoutingState } from '../risk/NotificationRouteSelect.js';
import { NotificationProviderSelect } from '../risk/NotificationProviderSelect.js';
import type { NotificationRouteRecord } from '../risk/risk.types.js';
import type { StrategyRiskNotification } from './strategy-optimization.api.js';
import type { RiskCycleMode } from './strategy-risk-application.model.js';
import {
  strategyRiskCycleModeLabel,
  strategyRiskCycleModeOptions,
  strategyRiskNotificationSeverityLabel,
  strategyRiskNotificationSeverityOptions,
} from './strategy-display-labels.js';

export type RiskNotificationForm = {
  enabled: boolean;
  severity: StrategyRiskNotification['severity'];
  cooldownMinutes: string;
  channel: string;
  providers?: string[];
};

export function StrategyRiskConfiguration({
  accounts,
  accountId,
  cycleMode,
  disabled,
  notification,
  canEnableNotification,
  routes,
  routingState,
  onAccountChange,
  onCycleModeChange,
  onNotificationChange,
}: {
  accounts: Account[];
  accountId: string;
  cycleMode: RiskCycleMode;
  disabled: boolean;
  notification: RiskNotificationForm;
  canEnableNotification: boolean;
  routes: NotificationRouteRecord[];
  routingState: NotificationRoutingState;
  onAccountChange: (value: string) => void;
  onCycleModeChange: (value: RiskCycleMode) => void;
  onNotificationChange: (value: RiskNotificationForm) => void;
}) {
  const selectedAccount = accounts.find((account) => account.id === accountId);
  return (
    <FieldGroup>
      <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field className="min-w-0">
          <FieldLabel>实际证券账户</FieldLabel>
          <Select
            value={accountId}
            disabled={disabled}
            onValueChange={(value) => {
              if (value) onAccountChange(value);
            }}
          >
            <SelectTrigger aria-label="实际证券账户" className="w-full">
              <SelectValue placeholder="选择账户">
                {selectedAccount ? accountDisplayLabel(selectedAccount) : '选择账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {accountDisplayLabel(account)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>现金账户与模拟账户不参与实际风险应用。</FieldDescription>
        </Field>
        <Field className="min-w-0">
          <FieldLabel>生效范围</FieldLabel>
          <Select
            value={cycleMode}
            disabled={disabled}
            onValueChange={(value) => {
              if (value) onCycleModeChange(value);
            }}
          >
            <SelectTrigger aria-label="生效范围" className="w-full">
              <SelectValue>{strategyRiskCycleModeLabel(cycleMode)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {strategyRiskCycleModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">通知</p>
            <p className="text-xs text-muted-foreground">通过已配置的通知路由发送风险提醒。</p>
          </div>
        </div>
        <Switch
          checked={notification.enabled}
          onCheckedChange={(enabled) => onNotificationChange({ ...notification, enabled })}
          disabled={disabled || (!notification.enabled && !canEnableNotification)}
          variant="risk"
          aria-label="风险通知"
        >
          <SwitchThumb variant="risk" aria-hidden="true" />
        </Switch>
      </div>
      <Collapsible>
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group -ml-2" />}>
          <ChevronDown
            data-icon="inline-start"
            className="transition-transform group-data-panel-open:rotate-180"
            aria-hidden="true"
          />
          通知设置
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FieldGroup className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <Field className="min-w-0">
              <FieldLabel>默认严重级别</FieldLabel>
              <Select
                value={notification.severity}
                disabled={disabled}
                onValueChange={(severity) => {
                  if (severity) onNotificationChange({ ...notification, severity });
                }}
              >
                <SelectTrigger aria-label="通知严重级别" className="w-full">
                  <SelectValue>
                    {strategyRiskNotificationSeverityLabel(notification.severity)}
                  </SelectValue>
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
            <Field className="min-w-0">
              <FieldLabel>默认冷却时间（分钟）</FieldLabel>
              <Input
                aria-label="通知冷却时间（分钟）"
                value={notification.cooldownMinutes}
                disabled={disabled}
                type="number"
                min="0"
                max="10080"
                onChange={(event) =>
                  onNotificationChange({ ...notification, cooldownMinutes: event.target.value })
                }
              />
              <FieldDescription>0 表示不等待；关键级提醒不受冷却限制。</FieldDescription>
            </Field>
            <NotificationProviderSelect disabled={disabled} routes={routes} state={routingState}
              value={notification.providers ?? []} onChange={(providers) => onNotificationChange({ ...notification, providers })} />
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  );
}
