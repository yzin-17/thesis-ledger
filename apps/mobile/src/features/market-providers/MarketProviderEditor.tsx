import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProviderManifest, MarketProviderTestResponse } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import type { SettingsStackParams } from '../../app/navigation-types';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
function ProviderForm({ provider }: { provider: ProviderManifest }) {
  const { api } = useMobileRuntime();
  const [method, setMethod] = useState(
    provider.credentialMethod ?? provider.credentialSchema?.methods[0]?.method ?? '',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState(JSON.stringify(provider.settings ?? {}, null, 2));
  const [baseline, setBaseline] = useState(settings);
  const [expectedVersion, setExpectedVersion] = useState(provider.configVersion);
  const [message, setMessage] = useState('');
  const [probe, setProbe] = useState<MarketProviderTestResponse | null>(null);
  const [routeText, setRouteText] = useState('');
  const [points, setPoints] = useState('');
  const [hkDaily, setHkDaily] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const command = useConfigCommand();
  const fields =
    provider.credentialSchema?.methods.find((item) => item.method === method)?.fields ?? [];
  const clearSensitive = () =>
    setValues((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([key]) => !fields.some((field) => field.name === key && field.secret),
        ),
      ),
    );
  useDirtyForm(Object.values(values).some(Boolean) || settings !== baseline, () => {
    setValues({});
    setSettings(baseline);
  });
  const operate = async (kind: 'save' | 'test' | 'account' | 'clear' | 'toggle' | 'remove') => {
    setMessage('');
    const descriptions = {
      save: '保存凭证和非敏感设置',
      test: '只读检查精确数据能力',
      account: '只读检查账号接口权限',
      clear: '清除当前凭证',
      toggle: provider.enabled ? '停用该来源' : '启用该来源',
      remove: '移除该来源的控制配置并重新同步路由',
    };
    if (
      !(await confirmAction(
        '确认行情配置操作？',
        `${provider.displayName}：${descriptions[kind]}。`,
        kind === 'remove' || kind === 'clear',
      ))
    ) {
      clearSensitive();
      return;
    }
    try {
      await command.submit(async () => {
        const credentials = Object.values(values).some(Boolean) ? { method, values } : undefined;
        if (kind === 'test' || kind === 'account') {
          const result = await api.market.testProvider(provider.providerId, {
            ...(credentials ? { credentials } : {}),
            purpose: kind === 'account' ? 'account_access' : 'capability_read',
            ...(kind === 'account' && points.trim()
              ? { accountLevel: { points: Number(points), independentApis: [
                ...(hkDaily ? ['hk_daily'] : []), ...(realtime ? ['rt_k'] : []),
              ] } } : {}),
            ...(routeText.trim() && kind === 'test'
              ? { route: JSON.parse(routeText) as unknown }
              : {}),
          });
          setProbe(result);
          setMessage(`检查结束：${result.status}；不会据此自动启用数据路由。`);
          return;
        }
        if (kind === 'remove') {
          const result = await api.market.removeProvider(provider.providerId);
          setMessage(
            result.removed
              ? '控制配置已移除，路由已同步。'
              : '移除尚未生效，请查看路由状态后重读。',
          );
          return;
        }
        const input = {
          expectedConfigVersion: expectedVersion,
          ...(kind === 'save'
            ? { settings: JSON.parse(settings) as unknown, ...(credentials ? { credentials } : {}) }
            : {}),
          ...(kind === 'clear' ? { clearCredentials: true } : {}),
          ...(kind === 'toggle' ? { enabled: !provider.enabled } : {}),
        };
        const result = await api.market.configureProvider(provider.providerId, input);
        setExpectedVersion(result.configVersion);
        if (kind === 'save') setBaseline(settings);
        setMessage('配置已保存，已重新读取当前代次。');
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    } finally {
      clearSensitive();
    }
  };
  const editable = provider.configurationMode === 'control' && !command.pending;
  return (
    <>
      <Feedback message={message} />
      <Copy>
        配置代次 {provider.configVersion ?? '未提供'}；
        {provider.credentialConfigured ? '已有凭证，留空沿用' : '尚无凭证'}
        。账号权限与数据准入独立。
      </Copy>
      <Section title="凭证与设置">
        <Choices
          label="凭证方式"
          value={method}
          options={
            provider.credentialSchema?.methods.map((item) => ({
              value: item.method,
              label: item.method === 'oauth' ? '网页授权' : `凭证方式 ${item.method}`,
            })) ?? []
          }
          onChange={(value) => {
            setMethod(value);
            setValues({});
          }}
          disabled={!editable}
        />
        {fields.map((field) => (
          <Field
            key={field.name}
            label={`凭证 ${field.name}${field.required ? '（必填）' : ''}`}
            value={values[field.name] ?? ''}
            onChange={(value) => setValues((previous) => ({ ...previous, [field.name]: value }))}
            secure={field.secret}
            editable={editable}
          />
        ))}
        <Field
          label="来源设置（JSON，不填写凭证）"
          value={settings}
          onChange={setSettings}
          multiline
          editable={editable}
        />
        <Action
          label="保存行情凭证与设置"
          disabled={!editable}
          onPress={() => void operate('save')}
        />
        <Action
          label={provider.enabled ? '停用行情来源' : '启用行情来源'}
          disabled={!editable}
          onPress={() => void operate('toggle')}
        />
        <Action
          label="清除行情凭证"
          disabled={!editable}
          destructive
          onPress={() => void operate('clear')}
        />
        <Action
          label="移除行情控制配置"
          disabled={!editable}
          destructive
          onPress={() => void operate('remove')}
        />
      </Section>
      <Section title="能力与账号检查">
        <Field
          label="精确能力目标（JSON，可留空）"
          value={routeText}
          onChange={setRouteText}
          multiline
          editable={!command.pending}
        />
        <Action
          label="检查数据能力"
          disabled={command.pending}
          onPress={() => void operate('test')}
        />
      <Field label="账号积分（可选）" value={points} onChange={setPoints} keyboardType="number-pad" editable={!command.pending} />
      <Copy muted>支持积分等级的来源按填写等级检查；留空由服务端决定。独立权限声明不能替代接口实际检查。</Copy>
      <Choices label="港股日线独立权限" value={String(hkDaily)} options={[{ value: 'false', label: '未开通港股日线' }, { value: 'true', label: '已开通港股日线' }]} onChange={(value) => setHkDaily(value === 'true')} disabled={command.pending} />
      <Choices label="实时行情独立权限" value={String(realtime)} options={[{ value: 'false', label: '未开通实时行情' }, { value: 'true', label: '已开通实时行情' }]} onChange={(value) => setRealtime(value === 'true')} disabled={command.pending} />
        <Action
          label="检查账号访问"
          disabled={command.pending || !provider.accountAccessSupported}
          onPress={() => void operate('account')}
        />
        {probe ? <Copy>{JSON.stringify(probe, null, 2)}</Copy> : null}
      </Section>
    </>
  );
}
export function MarketProviderEditor({
  route,
}: NativeStackScreenProps<SettingsStackParams, 'MarketProviderEditor'>) {
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'market-providers'],
    queryFn: ({ signal }) => api.market.getProviderRegistry(signal),
  });
  const provider = query.data?.providers.find(
    (item) => item.providerId === route.params.providerId,
  );
  return (
    <Page title={provider?.displayName ?? '管理行情来源'}>
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <Action
        label="重新读取来源配置"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      {provider ? <ProviderForm provider={provider} /> : null}
    </Page>
  );
}
