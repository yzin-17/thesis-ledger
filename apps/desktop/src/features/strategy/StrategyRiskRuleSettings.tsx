import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  strategyRiskNotificationSeverityLabel,
  strategyRiskNotificationSeverityOptions,
} from './strategy-display-labels.js';
import { parseCooldownMinutes } from './strategy-risk-application.model.js';
import type { RuleNotificationDrafts } from './strategy-risk-notification-form.js';
import type { StrategyRiskNotification } from './strategy-optimization.api.js';

export function StrategyRiskRuleSettings({
  rule,
  value = {},
  defaults,
  disabled,
  onChange,
}: {
  rule: { sourceKey: string; label: string };
  value?: RuleNotificationDrafts[string] | undefined;
  defaults: { severity: StrategyRiskNotification['severity']; cooldownMinutes: string };
  disabled: boolean;
  onChange: (value: RuleNotificationDrafts[string]) => void;
}) {
  const invalid = Boolean(
    value.cooldownMinutes?.trim() && parseCooldownMinutes(value.cooldownMinutes) === null,
  );
  const severityLabel = value.severity
    ? strategyRiskNotificationSeverityLabel(value.severity)
    : `默认（${strategyRiskNotificationSeverityLabel(defaults.severity)}）`;
  return (
    <FieldGroup className="grid w-full gap-3 sm:grid-cols-2">
      <Field className="min-w-0">
        <FieldLabel>
          <span className="sr-only">{rule.label}</span>严重级别
        </FieldLabel>
        <Select<StrategyRiskNotification['severity'] | 'inherit'>
          value={value.severity ?? 'inherit'}
          disabled={disabled}
          onValueChange={(severity) => {
            if (severity)
              onChange({ ...value, severity: severity === 'inherit' ? undefined : severity });
          }}
        >
          <SelectTrigger className="w-full" aria-label={`${rule.label}严重级别`}>
            <SelectValue>{severityLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="inherit">
                默认（{strategyRiskNotificationSeverityLabel(defaults.severity)}）
              </SelectItem>
              {strategyRiskNotificationSeverityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field className="min-w-0" invalid={invalid}>
        <FieldLabel>
          <span className="sr-only">{rule.label}</span>冷却时间（分钟）
        </FieldLabel>
        <Input
          type="number"
          min="0"
          max="10080"
          step="1"
          aria-label={`${rule.label}冷却时间（分钟）`}
          aria-invalid={invalid}
          value={value.cooldownMinutes ?? ''}
          placeholder={`默认：${defaults.cooldownMinutes} 分钟`}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, cooldownMinutes: event.target.value })}
        />
        {invalid ? <p className="text-xs text-destructive">请输入 0 到 10080 的整数。</p> : null}
      </Field>
    </FieldGroup>
  );
}
