import { Switch } from 'react-native';
import { Copy, Field } from '../../components/MobilePrimitives';
import { RiskNotificationProviderChoices } from './RiskNotificationProviderChoices';
import type { RiskForm } from './risk-rule-form';

export function RiskRuleNotificationFields({
  form,
  onChange,
  disabled,
}: {
  form: RiskForm;
  onChange: (patch: Partial<RiskForm>) => void;
  disabled: boolean;
}) {
  return (
    <>
      <Copy>风险通知</Copy>
      <Switch
        accessibilityLabel="风险通知"
        value={form.notificationEnabled !== false}
        disabled={disabled}
        onValueChange={(notificationEnabled) => onChange({ notificationEnabled })}
      />
      <Field
        label="通知冷却时间（分钟）"
        value={form.notificationCooldown ?? '30'}
        editable={!disabled}
        keyboardType="number-pad"
        onChange={(notificationCooldown) => onChange({ notificationCooldown })}
      />
      <RiskNotificationProviderChoices
        value={form.notificationProviders}
        disabled={disabled}
        onChange={(notificationProviders) => onChange({ notificationProviders })}
      />
      <Copy muted>冷却时间为 0 表示不等待；关键级提醒不受冷却限制。</Copy>
    </>
  );
}
