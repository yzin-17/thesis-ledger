import { useMarketProviderDialogs } from './useMarketProviderDialogs.js';
import { PageHeader } from '../shared/PageHeader.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToastManager } from '@/components/ui/toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { RoutingConfigPanel } from './RoutingConfigPanel.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { MarketProviderPanel } from './MarketProviderPanel.js';
import { MarketDataSectionTabs } from './MarketDataSectionTabs.js';
import { useMarketProviderEnabled } from './useMarketProviderEnabled.js';
import { useRemoveMarketProviderMutation } from './market-data.mutations.js';
import { marketDataKeys, useMarketDataQueries } from './market-data.queries.js';
import type { ProviderManifest } from './market-data.types.js';
import { routePolicySummaryV3 } from './market-policy-status-v3.js';
import { useMarketPolicyWorkflow } from './useMarketPolicyWorkflow.js';
import { RuleSourceMonitorPanel } from './RuleSourceMonitorPanel.js';

export function MarketDataPage() {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmDialog();
  const { policy, providers, routeCapabilities, catalog } = useMarketDataQueries();
  const pageRefresh = usePageRefresh([{ queryKey: marketDataKeys.root }]);
  const marketDataRefreshing = pageRefresh.refreshing;
  const removeProvider = useRemoveMarketProviderMutation();

  const providerEnabled = useMarketProviderEnabled(providers.data ?? []);
  const providerDrafts = providerEnabled.providers;
  const providerDialogs = useMarketProviderDialogs(providers.data ?? [], routeCapabilities.data);
  const toastManager = useToastManager();
  const [message, setErrorMessage] = useState<string | null>(null);
  const setMessage = useCallback(
    (next: { type: 'success' | 'error'; text: string } | null) => {
      setErrorMessage(next?.type === 'error' ? next.text : null);
      if (next?.type === 'success')
        toastManager.add({ title: next.text, type: 'success', timeout: 2800 });
    },
    [toastManager],
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const marketPolicy = useMarketPolicyWorkflow({
    policy: policy.data,
    catalogComplete: routeCapabilities.data?.status === 'complete',
    setBusyAction,
    setMessage,
  });

  const { loadState, controlsDisabled, policyStatus } = marketDataPageStatus(
    policy,
    providers,
    catalog,
    busyAction,
  );
  const routeProviderSummary = useMemo(() => {
    return {
      total: providerDrafts.length,
      configured: providerDrafts.filter((provider) => provider.configured && provider.enabled)
        .length,
    };
  }, [providerDrafts]);

  const refresh = async () => {
    setMessage(null);
    await pageRefresh.refresh();
  };

  const replaceProvider = async (provider: ProviderManifest) => {
    try {
      await providerEnabled.setEnabled(provider);
      await queryClient.invalidateQueries({ queryKey: marketDataKeys.routeCapabilities() });
    } catch (error) {
      setMessage({
        type: 'error',
        text: requestFailureMessage(error, '启停保存失败，请稍后重试。'),
      });
    }
  };

  const handleRemoveProvider = async (provider: ProviderManifest) => {
    if (
      !(await confirm({
        title: `移除 ${provider.displayName}？`,
        description: '该操作会从所有市场数据路由中移除此提供方，并更新路由策略。',
        confirmLabel: '移除提供方',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    setBusyAction(`provider-remove:${provider.providerId}`);
    try {
      const result = await removeProvider.mutateAsync(provider);
      if (!result.removed)
        throw new Error(result.pending ? '路由策略尚未生效，请稍后重试。' : '数据源未被移除。');
      if (result.policy) {
        marketPolicy.acceptPolicy(result.policy);
      }
      setMessage({
        type: 'success',
        text: `${provider.displayName} 已从路由移除。`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: requestFailureMessage(error, '提供方移除失败，请稍后重试。'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="module-page flex flex-col gap-card" aria-labelledby="market-data-title">
      <PageHeader
        titleId="market-data-title"
        eyebrow="MARKET DATA"
        title="市场数据"
        actions={
          <>
            <RefreshIconButton
              label="刷新市场数据状态"
              refreshing={marketDataRefreshing}
              disabled={busyAction !== null}
              onClick={() => void refresh()}
            />
          </>
        }
      />

      {loadState === 'degraded' && (
        <Alert variant="destructive">
          <AlertTitle>DSA Control 暂时不可用</AlertTitle>
          <AlertDescription>只读展示已加载的最后状态；保存和测试已暂停。</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-wrap items-center gap-2" aria-label="市场数据概况">
        <Badge variant="outline">路由状态：{policyStatus}</Badge>
        <Badge variant="outline">
          {providers.data
            ? `${routeProviderSummary.configured}/${routeProviderSummary.total} 个数据源可用`
            : '等待数据源状态'}
        </Badge>
        <Badge variant="outline">
          {typeof catalog.data?.instrumentCount === 'number'
            ? `${catalog.data.instrumentCount.toLocaleString('zh-CN')} 个本地标的`
            : '等待标的目录'}
        </Badge>
      </section>

      {providerDialogs.dialogs}

      <MarketDataSectionTabs
        defaultSection={
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('section') === 'monitor'
            ? 'monitor'
            : 'routing'
        }
        providerPanel={
          <MarketProviderPanel
            refreshing={providers.isRefetching}
            providers={providerDrafts}
            catalog={routeCapabilities.data}
            disabled={controlsDisabled}
            busyAction={busyAction}
            pendingProviderIds={providerEnabled.pendingProviderIds}
            onProviderChange={(provider) => void replaceProvider(provider)}
            onConfigure={providerDialogs.configure}
            onTest={providerDialogs.inspect}
            onRemove={(provider) => void handleRemoveProvider(provider)}
          />
        }
        policyPanel={
          policy.isError && !marketPolicy.draft ? (
            <DataStateBanner
              state="error"
              description="路由策略暂时无法读取，请重新加载。"
              onRetry={() => void policy.refetch()}
            />
          ) : (
            <RoutingConfigPanel
              providers={providerDrafts}
              refreshing={routeCapabilities.isFetching || providers.isFetching}
              catalog={routeCapabilities.data?.entries ?? []}
              disabled={controlsDisabled || routeCapabilities.isPending}
              onRetry={() => void marketPolicy.retry()}
            />
          )
        }
        monitorPanel={<RuleSourceMonitorPanel />}
      />
    </section>
  );
}

function marketDataPageStatus(
  policy: ReturnType<typeof useMarketDataQueries>['policy'],
  providers: ReturnType<typeof useMarketDataQueries>['providers'],
  catalog: ReturnType<typeof useMarketDataQueries>['catalog'],
  busyAction: string | null,
) {
  let loadState: 'degraded' | 'loading' | 'ready' = 'ready';
  if (policy.isError || providers.isError || catalog.isError) loadState = 'degraded';
  else if (policy.isPending || providers.isPending || catalog.isPending) loadState = 'loading';
  const controlsDisabled = loadState !== 'ready' || busyAction !== null;
  let policyStatus = routePolicySummaryV3(policy.data);
  if (policy.isError) policyStatus = policy.data ? '旧数据，刷新失败' : '读取失败';
  return { loadState, controlsDisabled, policyStatus };
}
