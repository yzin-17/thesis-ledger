import { Choices, Copy, Field, ContentSection as Section } from '../../components/MobilePrimitives';
import type { RiskNotificationForm } from './risk-notification-model';

export function RiskRuleNotificationFields({
  rules,
  value,
  onChange,
  disabled,
}: {
  rules: { sourceKey: string; label: string }[];
  value: RiskNotificationForm;
  onChange: (value: RiskNotificationForm) => void;
  disabled: boolean;
}) {
  return (
    <Section title="单条规则通知设置">
      <Copy>未单独设置时使用默认值；冷却时间留空表示继承，0 表示不等待。</Copy>
      {rules.map((rule) => {
        const draft = value.ruleOverrides?.[rule.sourceKey] ?? {};
        const patch = (part: typeof draft) =>
          onChange({
            ...value,
            ruleOverrides: {
              ...value.ruleOverrides,
              [rule.sourceKey]: { ...draft, ...part },
            },
          });
        return (
          <Section key={rule.sourceKey} title={rule.label}>
            <Choices
              label={`${rule.label}严重级别`}
              value={draft.severity ?? 'inherit'}
              disabled={disabled}
              onChange={(severity) =>
                patch({ severity: severity === 'inherit' ? undefined : severity })
              }
              options={[
                { value: 'inherit', label: '使用默认值' },
                { value: 'info', label: '提示' },
                { value: 'warning', label: '警告' },
                { value: 'error', label: '严重' },
                { value: 'critical', label: '关键' },
              ]}
            />
            <Field
              label={`${rule.label}冷却时间（分钟）`}
              value={draft.cooldown ?? ''}
              editable={!disabled}
              placeholder={`默认：${value.cooldown} 分钟`}
              keyboardType="number-pad"
              onChange={(cooldown) => patch({ cooldown })}
            />
          </Section>
        );
      })}
    </Section>
  );
}
