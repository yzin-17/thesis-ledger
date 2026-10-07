import { PageHeader } from '../shared/PageHeader.js';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToastManager } from '@/components/ui/toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { InstrumentCatalogPanel } from './InstrumentCatalogPanel.js';
import { MarketPolicyPanel } from './MarketPolicyPanel.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { ProviderCredentialsSheet } from './ProviderCredentialsSheet.js';
import { MarketProviderPanel } from './MarketProviderPanel.js';
import { MarketDataSectionTabs } from './MarketDataSectionTabs.js';
import { useMarketProviderEnabled } from './useMarketProviderEnabled.js';
import {
  useCatalogSyncMutation,
  useConfirmInstrumentMutation,
  useRemoveMarketProviderMutation,
  useTestMarketProviderMutation,
} from './market-data.mutations.js';
import {
  marketDataKeys,
  useInstrumentSearchQuery,
  useMarketDataQueries,
} from './market-data.queries.js';
import type { ProviderManifest } from './market-data.types.js';
import { useCatalogJobProgress } from './useCatalogJobProgress.js';
import { routePolicySummaryV3 } from './market-policy-status-v3.js';
import { useMarketPolicyWorkflow } from './useMarketPolicyWorkflow.js';
import { marketProviderProbeFeedback } from './market-provider-probe-feedback.js';

export function MarketDataPage() {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmDialog();
  const { policy, providers, routeCapabilities, catalog } = useMarketDataQueries();
  const marketDataRefreshing =
    policy.isFetching || providers.isFetching || routeCapabilities.isFetching || catalog.isFetching;
  const testProvider = useTestMarketProviderMutation();
  const removeProvider = useRemoveMarketProviderMutation();
  const syncCatalog = useCatalogSyncMutation();
  const confirmInstrument = useConfirmInstrumentMutation();

  const providerEnabled = useMarketProviderEnabled(providers.data ?? []);
  const providerDrafts = providerEnabled.providers;
  const [credentialProviderId, setCredentialProviderId] = useState<string | null>(null);
  const credentialProvider = providers.data?.find(
    (provider) => provider.providerId === credentialProviderId,
  );
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
  const [catalogJobId, setCatalogJobId] = useState<string | null>(null);
  const [submittedSearch, setSubmittedSearch] = useState('');

  const marketPolicy = useMarketPolicyWorkflow({
    policy: policy.data,
    catalogComplete: routeCapabilities.data?.status === 'complete',
    setBusyAction,
    setMessage,
  });

  const clearCatalogJob = useCallback(() => setCatalogJobId(null), []);
  const catalogJob = useCatalogJobProgress(catalogJobId, clearCatalogJob, setMessage);

  const instrumentSearch = useInstrumentSearchQuery(submittedSearch);
  let loadState: 'degraded' | 'loading' | 'ready' = 'ready';
  if (policy.isError || providers.isError || catalog.isError) loadState = 'degraded';
  else if (policy.isPending || providers.isPending || catalog.isPending) loadState = 'loading';
  const controlsDisabled = loadState !== 'ready' || busyAction !== null;
  const routeProviderSummary = useMemo(() => {
    return {
      total: providerDrafts.length,
      configured: providerDrafts.filter((provider) => provider.configured && provider.enabled)
        .length,
    };
  }, [providerDrafts]);

  const refresh = async () => {
    setMessage(null);
    await queryClient.invalidateQueries({ queryKey: marketDataKeys.root });
  };

  const replaceProvider = async (provider: ProviderManifest) => {
    try {
      await providerEnabled.setEnabled(provider);
      await queryClient.invalidateQueries({ queryKey: marketDataKeys.routeCapabilities() });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '启停保存失败。',
      });
    }
  };

  const handleTestProvider = async (provider: ProviderManifest) => {
    setBusyAction(`provider-test:${provider.providerId}`);
    setMessage(null);
    try {
      const result = await testProvider.mutateAsync({
        provider,
      });
      setMessage(marketProviderProbeFeedback(result, provider.displayName));
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Provider 测试失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveProvider = async (provider: ProviderManifest) => {
    if (
      !(await confirm({
        title: `移除 ${provider.displayName}？`,
        description: '该操作会从所有市场数据路由中移除 Provider，并更新路由策略。',
        confirmLabel: '移除 Provider',
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
        text: error instanceof Error ? error.message : 'Provider 移除失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncCatalog = async () => {
    setBusyAction('catalog-sync');
    setMessage(null);
    try {
      const result = await syncCatalog.mutateAsync();
      if (result.status === 'failed' || result.status === 'timeout') {
        setMessage({ type: 'error', text: '标的目录同步任务失败，请稍后重试。' });
      } else if (result.acknowledged) {
        setMessage({ type: 'success', text: '标的目录已同步。' });
        await queryClient.invalidateQueries({ queryKey: marketDataKeys.catalog() });
      } else if (result.id) {
        setCatalogJobId(result.id);
        setMessage({ type: 'success', text: '标的目录同步任务已提交，状态将自动刷新。' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '标的目录同步失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmInstrument = async (instrument: { id: string; displayName: string }) => {
    setBusyAction(`instrument-confirm:${instrument.id}`);
    try {
      await confirmInstrument.mutateAsync(instrument.id);
      await instrumentSearch.refetch();
      setMessage({ type: 'success', text: `${instrument.displayName} 已确认，可用于持仓关联。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '标的确认失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="module-page" aria-labelledby="market-data-title">
      <PageHeader
        titleId="market-data-title"
        eyebrow="MARKET DATA"
        title="市场数据"
        description="管理行情来源、数据优先级与标的目录。"
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
          <AlertDescription>
            只读展示已加载的最后状态；保存、测试和目录同步已暂停。
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <section className="mt-5 flex flex-wrap items-center gap-2" aria-label="市场数据概况">
        <Badge variant="outline">路由状态：{routePolicySummaryV3(policy.data)}</Badge>
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

      {credentialProvider && (
        <ProviderCredentialsSheet
          key={credentialProvider.providerId}
          provider={credentialProvider}
          onClose={() => setCredentialProviderId(null)}
        />
      )}

      <MarketDataSectionTabs
        providerPanel={
          <MarketProviderPanel
            providers={providerDrafts}
            disabled={controlsDisabled}
            busyAction={busyAction}
            pendingProviderIds={providerEnabled.pendingProviderIds}
            onProviderChange={(provider) => void replaceProvider(provider)}
            onConfigure={(provider) => setCredentialProviderId(provider.providerId)}
            onTest={(provider) => void handleTestProvider(provider)}
            onRemove={(provider) => void handleRemoveProvider(provider)}
          />
        }
        policyPanel={
          <MarketPolicyPanel
            policy={marketPolicy.draft}
            serverPolicy={policy.data ?? null}
            catalog={routeCapabilities.data}
            catalogPending={routeCapabilities.isPending}
            catalogQueryFailed={routeCapabilities.isError}
            providers={providerDrafts}
            disabled={controlsDisabled || routeCapabilities.isPending}
            saving={marketPolicy.saving}
            retrying={marketPolicy.retrying}
            dirty={marketPolicy.dirty}
            onChange={marketPolicy.changeDraft}
            onSave={() => void marketPolicy.save()}
            onRetry={() => void marketPolicy.retry()}
          />
        }
        catalogPanel={
          <InstrumentCatalogPanel
            catalog={catalogJob.data ?? catalog.data ?? null}
            disabled={controlsDisabled}
            syncing={syncCatalog.isPending || Boolean(catalogJobId)}
            searchBusy={instrumentSearch.isFetching}
            searchResults={instrumentSearch.data ?? []}
            confirmingId={
              busyAction?.startsWith('instrument-confirm:')
                ? busyAction.slice('instrument-confirm:'.length)
                : null
            }
            onSync={() => void handleSyncCatalog()}
            onSearch={setSubmittedSearch}
            onConfirm={(instrument) => void handleConfirmInstrument(instrument)}
          />
        }
      />
    </section>
  );
}
