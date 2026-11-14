import { Choices, Field, Copy } from '../../components/MobilePrimitives';
import { Switch } from 'react-native';
import type { RiskNotificationForm } from './risk-notification-model';
import { RiskNotificationProviderChoices } from '../risk-rules/RiskNotificationProviderChoices';
export function RiskNotificationFields({
  value,
  onChange,
  disabled,
}: {
  value: RiskNotificationForm;
  onChange: (v: RiskNotificationForm) => void;
  disabled: boolean;
}) {
  const patch = (part: Partial<RiskNotificationForm>) => onChange({ ...value, ...part });
  return (
    <>
      <Copy>策略应用通知</Copy>
      <Switch accessibilityLabel="策略应用通知" value={value.enabled} disabled={disabled} onValueChange={(enabled) => patch({ enabled })} />
      <Field
        label="默认冷却时间（分钟）"
        value={value.cooldown}
        editable={!disabled}
        keyboardType="number-pad"
        onChange={(cooldown) => patch({ cooldown })}
      />
      <Choices
        label="默认严重级别"
        value={value.severity}
        disabled={disabled}
        onChange={(severity) => patch({ severity })}
        options={[
          { value: 'info', label: '提示' },
          { value: 'warning', label: '警告' },
          { value: 'error', label: '严重' },
          { value: 'critical', label: '关键' },
        ]}
      />
      <RiskNotificationProviderChoices value={value.providers} disabled={disabled} onChange={(providers) => patch({ providers })} />
      <Copy muted>冷却时间为 0 表示不等待；关键级提醒不受冷却限制。</Copy>
    </>
  );
}
