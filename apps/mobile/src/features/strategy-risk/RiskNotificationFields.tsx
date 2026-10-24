import { Choices, Field } from '../../components/MobilePrimitives';
import type { RiskNotificationForm } from './risk-notification-model';
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
      <Choices
        label="策略应用通知"
        value={value.enabled ? 'yes' : 'no'}
        disabled={disabled}
        onChange={(v) => patch({ enabled: v === 'yes' })}
        options={[
          { value: 'no', label: '关闭通知' },
          { value: 'yes', label: '启用通知' },
        ]}
      />
      <Field
        label="通知冷却分钟"
        value={value.cooldown}
        editable={!disabled}
        keyboardType="number-pad"
        onChange={(cooldown) => patch({ cooldown })}
      />
      <Choices
        label="通知级别"
        value={value.severity}
        disabled={disabled}
        onChange={(severity) => patch({ severity })}
        options={[
          { value: 'info', label: '提示' },
          { value: 'warning', label: '警告' },
          { value: 'error', label: '错误' },
          { value: 'critical', label: '严重' },
        ]}
      />
      <Choices
        label="飞书通知渠道"
        value={value.feishu ? 'yes' : 'no'}
        disabled={disabled}
        onChange={(v) => patch({ feishu: v === 'yes' })}
        options={[
          { value: 'no', label: '不使用飞书' },
          { value: 'yes', label: '使用飞书' },
        ]}
      />
    </>
  );
}
