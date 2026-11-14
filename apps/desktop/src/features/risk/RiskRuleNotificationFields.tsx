import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { NotificationProviderSelect } from './NotificationProviderSelect.js';
import type { RuleNotificationForm } from './risk-rule-notification-form.js';
import type { NotificationRoutingState } from './NotificationRouteSelect.js';
import type { NotificationRouteRecord } from './risk.types.js';

export function RiskRuleNotificationFields({
  value,
  onChange,
  routes,
  state,
  disabled,
  onRetry,
  error,
}: {
  value: RuleNotificationForm;
  onChange: (value: RuleNotificationForm) => void;
  routes: NotificationRouteRecord[];
  state: NotificationRoutingState;
  disabled: boolean;
  onRetry: () => void;
  error?: string | undefined;
}) {
  return (
    <FieldGroup>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">风险通知</span>
        <Switch
          variant="risk"
          aria-label="风险通知"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        >
          <SwitchThumb variant="risk" />
        </Switch>
      </div>
      <Field>
        <FieldLabel>通知冷却时间（分钟）</FieldLabel>
        <Input
          aria-label="通知冷却时间（分钟）"
          type="number"
          min="0"
          max="10080"
          step="1"
          value={value.cooldownMinutes}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, cooldownMinutes: event.target.value })}
        />
        <FieldDescription>0 表示不等待；关键级提醒不受冷却限制。</FieldDescription>
      </Field>
      <NotificationProviderSelect
        routes={routes}
        value={value.providers ?? []}
        onChange={(providers) => onChange({ ...value, providers })}
        state={state}
        disabled={disabled}
        onRetry={onRetry}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </FieldGroup>
  );
}
