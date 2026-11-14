import { useQuery } from '@tanstack/react-query';
import { Switch, View } from 'react-native';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy, QueryStatus, ContentSection } from '../../components/MobilePrimitives';

export function RiskNotificationProviderChoices({
  value,
  onChange,
  disabled,
}: {
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  disabled: boolean;
}) {
  const { api, scope, theme } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'risk-notification-providers'],
    queryFn: ({ signal }) => api.risk.getRiskRouting(signal),
  });
  const routes = query.data?.availableRoutes ?? [];
  const selected = value ?? query.data?.selectedProviders ?? [];
  const missing = selected.filter((name) => !routes.some((route) => route.provider === name));
  return (
    <ContentSection title="通知提供方">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {routes.map((route) => (
        <View
          key={route.provider}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Copy>{route.provider}</Copy>
          </View>
          <Switch
            accessibilityLabel={`通知提供方 ${route.provider}`}
            value={selected.includes(route.provider)}
            disabled={disabled || query.isError || query.isPending}
            trackColor={{ true: theme.brand }}
            onValueChange={(enabled) =>
              onChange(
                enabled
                  ? [...selected, route.provider]
                  : selected.filter((name) => name !== route.provider),
              )
            }
          />
        </View>
      ))}
      {query.isSuccess && missing.length > 0 ? (
        <Copy>已选提供方当前不可用：{missing.join('、')}。请重新选择。</Copy>
      ) : null}
      <Copy muted>不选择提供方时不发送通知，监控和事件仍继续。</Copy>
    </ContentSection>
  );
}
