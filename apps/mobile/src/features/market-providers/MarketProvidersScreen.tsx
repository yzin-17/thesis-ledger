import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
export function MarketProvidersScreen({
  navigation,
}: NativeStackScreenProps<SettingsStackParams, 'MarketProviders'>) {
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'market-providers'],
    queryFn: ({ signal }) => api.market.getProviderRegistry(signal),
  });
  return (
    <Page title="行情来源与账号">
      <Copy muted>凭证、账号访问、数据准入与路由生效分别判断。此处配置对整个服务生效。</Copy>
      <QueryStatus
        query={query}
        empty={query.data?.providers.length === 0}
        retry={() => void query.refetch()}
      />
      <Action
        label="重新读取行情来源"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      {query.data?.providers.map((provider) => (
        <Section key={provider.providerId} title={provider.displayName}>
          <Copy>
            {provider.enabled ? '已启用' : '已停用'} ·{' '}
            {provider.credentialConfigured ? '凭证已配置' : '凭证未配置'} · 配置代次{' '}
            {provider.configVersion ?? '未提供'}
          </Copy>
          <Copy>
            配置方式：{provider.configurationMode === 'control' ? '客户端可配置' : '服务端管理'}
            ；市场：{provider.markets?.join('、') || '未声明'}
          </Copy>
          <Copy>能力：{Object.keys(provider.capabilities).join('、') || '未声明'}</Copy>
          <Copy>来源准入与能力：{JSON.stringify(provider.upstreamSources ?? [])}</Copy>
          <Action
            label={`管理 ${provider.displayName}`}
            onPress={() =>
              navigation.navigate('MarketProviderEditor', { providerId: provider.providerId })
            }
          />
        </Section>
      ))}
      <Action label="Longbridge 网页授权" onPress={() => navigation.navigate('ProviderOAuth')} />
    </Page>
  );
}
