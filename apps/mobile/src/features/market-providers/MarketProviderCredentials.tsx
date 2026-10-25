import type { ProviderManifest } from '@thesis-ledger/schemas';
import { Action, Choices, Field, Section } from '../../components/MobilePrimitives';
const methodLabels: Record<string, string> = {
  token: '令牌',
  api_key: 'API 密钥',
  oauth: '网页授权',
  app_key: '应用密钥',
};
const fieldLabels: Record<string, string> = {
  token: '访问令牌',
  api_key: 'API 密钥',
  app_key: '应用标识',
  app_secret: '应用密钥',
  access_token: '访问令牌',
  refresh_token: '刷新令牌',
  client_id: '客户端标识',
  client_secret: '客户端密钥',
};
export function credentialFields(provider: ProviderManifest, method: string) {
  return provider.credentialSchema?.methods.find((item) => item.method === method)?.fields ?? [];
}
type Props = {
  provider: ProviderManifest;
  method: string;
  values: Record<string, string>;
  settings: string;
  editable: boolean;
  onMethod: (value: string) => void;
  onField: (name: string, value: string) => void;
  onSettings: (value: string) => void;
  onAction: (kind: 'save' | 'toggle' | 'clear' | 'remove') => void;
};
export function MarketProviderCredentials({
  provider,
  method,
  values,
  settings,
  editable,
  onMethod,
  onField,
  onSettings,
  onAction,
}: Props) {
  return (
    <Section title="凭证与设置">
      <Choices
        label="凭证方式"
        value={method}
        options={
          provider.credentialSchema?.methods.map((item) => ({
            value: item.method,
            label: methodLabels[item.method] ?? `其他凭证（${item.method}）`,
          })) ?? []
        }
        onChange={onMethod}
        disabled={!editable}
      />
      {credentialFields(provider, method).map((field) => (
        <Field
          key={field.name}
          label={`${fieldLabels[field.name] ?? `凭证 ${field.name}`}${field.required ? '（必填）' : ''}`}
          value={values[field.name] ?? ''}
          onChange={(value) => onField(field.name, value)}
          secure={field.secret}
          editable={editable}
        />
      ))}
      <Field
        label="来源设置（JSON，不填写凭证）"
        value={settings}
        onChange={onSettings}
        multiline
        editable={editable}
      />
      <Action label="保存行情凭证与设置" disabled={!editable} onPress={() => onAction('save')} />
      <Action
        label={provider.enabled ? '停用行情来源' : '启用行情来源'}
        disabled={!editable}
        onPress={() => onAction('toggle')}
      />
      <Action
        label="清除行情凭证"
        disabled={!editable}
        destructive
        onPress={() => onAction('clear')}
      />
      <Action
        label="移除行情控制配置"
        disabled={!editable}
        destructive
        onPress={() => onAction('remove')}
      />
    </Section>
  );
}
