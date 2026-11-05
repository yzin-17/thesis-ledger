import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProviderManifest, MarketProviderTestResponse } from '@thesis-ledger/schemas';
import { useDirtyForm, useMobileRuntime, confirmAction } from '../../app/MobileRuntime';
import type { SettingsStackParams } from '../../app/navigation-types';
import { Action, Copy, Feedback, Page, QueryStatus } from '../../components/MobilePrimitives';
import { useConfigCommand } from '../configuration/use-config-command';
import { MarketProviderCredentials, credentialFields } from './MarketProviderCredentials';
import { MarketProviderProbe, providerProbeInput } from './MarketProviderProbe';
function ProviderForm({
  provider,
  readable,
  reload,
}: {
  provider: ProviderManifest;
  readable: boolean;
  reload: () => Promise<ProviderManifest | undefined>;
}) {
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
  const [probeDraft, setProbeDraft] = useState({
    route: '',
    points: '',
    hkDaily: false,
    realtime: false,
  });
  const command = useConfigCommand();
  const operation = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      operation.current?.abort();
    },
    [],
  );
  const fields = credentialFields(provider, method);
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
  const adoptLatest = async () => {
    if (
      !(await confirmAction('采用服务端行情配置？', '未保存输入将被最新配置替换，凭证输入将清空。'))
    )
      return;
    setValues({});
    try {
      const latest = await reload();
      if (!latest) {
        setMessage('来源已不存在，请返回列表。');
        return;
      }
      const text = JSON.stringify(latest.settings ?? {}, null, 2);
      setSettings(text);
      setBaseline(text);
      setExpectedVersion(latest.configVersion);
      setMethod(latest.credentialMethod ?? latest.credentialSchema?.methods[0]?.method ?? '');
      setMessage('已采用服务端最新配置，可重新编辑。');
    } catch {
      setMessage('最新配置读取失败，当前非敏感设置仍保留。');
    }
  };
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
    const controller = new AbortController();
    operation.current = controller;
    clearSensitive();
    try {
      await command.submit(async () => {
        const credentials = Object.values(values).some(Boolean) ? { method, values } : undefined;
        if (kind === 'test' || kind === 'account') {
          const result = await api.market.testProvider(
            provider.providerId,
            providerProbeInput(kind, probeDraft, credentials),
            controller.signal,
          );
          setProbe(result);
          setMessage(`检查结束：${result.status}；不会据此自动启用数据路由。`);
          return;
        }
        if (kind === 'remove') {
          const result = await api.market.removeProvider(provider.providerId, controller.signal);
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
        const result = await api.market.configureProvider(
          provider.providerId,
          input,
          controller.signal,
        );
        setExpectedVersion(result.configVersion);
        if (kind === 'save') setBaseline(settings);
        setMessage('配置已保存，已重新读取当前代次。');
      });
    } catch (error) {
      if (controller.signal.aborted) setMessage('已取消等待，请重新读取服务端状态。');
      else setMessage(error instanceof Error ? error.message : '操作未完成。');
    } finally {
      clearSensitive();
      operation.current = null;
    }
  };
  const editable = provider.configurationMode === 'control' && !command.pending && readable;
  return (
    <>
      <Feedback message={message} />
      {command.pending ? (
        <Action
          label="取消等待行情操作"
          onPress={() => {
            operation.current?.abort();
            clearSensitive();
          }}
        />
      ) : null}
      <Copy>
        配置代次 {provider.configVersion ?? '未提供'}；
        {provider.credentialConfigured ? '已有凭证，留空沿用' : '尚无凭证'}
        。账号权限与数据准入独立。
      </Copy>
      <Action
        label="放弃输入并采用服务端行情配置"
        disabled={command.pending}
        onPress={() => void adoptLatest()}
      />
      <MarketProviderCredentials
        provider={provider}
        method={method}
        values={values}
        settings={settings}
        editable={editable}
        onMethod={(value) => {
          setMethod(value);
          setValues({});
        }}
        onField={(name, value) => setValues((previous) => ({ ...previous, [name]: value }))}
        onSettings={setSettings}
        onAction={(kind) => void operate(kind)}
      />
      <MarketProviderProbe
        draft={probeDraft}
        change={(patch) => setProbeDraft((value) => ({ ...value, ...patch }))}
        pending={command.pending || !readable}
        accountSupported={provider.accountAccessSupported === true}
        run={(kind) => void operate(kind)}
        result={probe}
      />
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
      {provider ? (
        <ProviderForm
          provider={provider}
          readable={query.isSuccess}
          reload={async () => {
            const result = await query.refetch({ throwOnError: true });
            return result.data?.providers.find(
              (item) => item.providerId === route.params.providerId,
            );
          }}
        />
      ) : null}
    </Page>
  );
}
