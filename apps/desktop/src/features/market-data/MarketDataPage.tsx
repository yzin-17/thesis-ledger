import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InstrumentCatalogPanel } from './InstrumentCatalogPanel.js';
import { MarketPolicyPanel } from './MarketPolicyPanel.js';
import { MarketProviderPanel } from './MarketProviderPanel.js';
import {
  useCatalogSyncMutation,
  useClearMarketProviderCredentialMutation,
  useConfirmInstrumentMutation,
  useRemoveMarketProviderMutation,
  useSaveMarketPolicyMutation,
  useSaveMarketProviderMutation,
  useTestMarketProviderMutation,
} from './market-data.mutations.js';
import {
  marketDataKeys,
  useCatalogJobQuery,
  useInstrumentSearchQuery,
  useMarketDataQueries,
} from './market-data.queries.js';
import type { MarketPolicy, ProviderManifest } from './market-data.types.js';

export function MarketDataPage() {
  const queryClient = useQueryClient();
  const { policy, providers, catalog } = useMarketDataQueries();
  const savePolicy = useSaveMarketPolicyMutation();
  const saveProvider = useSaveMarketProviderMutation();
  const clearCredential = useClearMarketProviderCredentialMutation();
  const testProvider = useTestMarketProviderMutation();
  const removeProvider = useRemoveMarketProviderMutation();
  const syncCatalog = useCatalogSyncMutation();
  const confirmInstrument = useConfirmInstrumentMutation();

  const [policyDraft, setPolicyDraft] = useState<MarketPolicy | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<ProviderManifest[]>([]);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [catalogJobId, setCatalogJobId] = useState<string | null>(null);
  const [submittedSearch, setSubmittedSearch] = useState('');

  useEffect(() => {
    if (policy.data) setPolicyDraft(policy.data);
  }, [policy.data]);
  useEffect(() => {
    if (providers.data) setProviderDrafts(providers.data);
  }, [providers.data]);

  const catalogJob = useCatalogJobQuery(catalogJobId);
  useEffect(() => {
    const result = catalogJob.data;
    if (!catalogJobId || !result) return;
    if (result.acknowledged) {
      setMessage({ type: 'success', text: `标的目录已同步至 generation ${result.generation}。` });
      setCatalogJobId(null);
      void queryClient.invalidateQueries({ queryKey: marketDataKeys.catalog() });
      return;
    }
    if (result.status === 'failed' || result.status === 'timeout') {
      setMessage({ type: 'error', text: '标的目录同步任务失败，请稍后重试。' });
      setCatalogJobId(null);
    }
  }, [catalogJob.data, catalogJobId, queryClient]);

  const instrumentSearch = useInstrumentSearchQuery(submittedSearch);
  const loadState =
    policy.isError || providers.isError || catalog.isError
      ? 'degraded'
      : policy.isPending || providers.isPending || catalog.isPending
        ? 'loading'
        : 'ready';
  const controlsDisabled = loadState !== 'ready' || busyAction !== null;
  const configuredProviderCount = useMemo(
    () => providerDrafts.filter((provider) => provider.configured && provider.enabled).length,
    [providerDrafts],
  );

  const refresh = async () => {
    setMessage(null);
    await queryClient.invalidateQueries({ queryKey: marketDataKeys.root });
  };

  const handleSavePolicy = async () => {
    if (!policyDraft) return;
    setBusyAction('policy-save');
    setMessage(null);
    try {
      const saved = await savePolicy.mutateAsync(policyDraft);
      setPolicyDraft(saved);
      setMessage({ type: 'success', text: `路由策略已提交，revision ${saved.revision}。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '路由策略提交失败。' });
    } finally {
      setBusyAction(null);
    }
  };

  const replaceProvider = (provider: ProviderManifest) =>
    setProviderDrafts((current) => current.map((item) => item.providerId === provider.providerId ? provider : item));

  const handleSaveProvider = async (provider: ProviderManifest) => {
    setBusyAction(`provider-save:${provider.providerId}`);
    setMessage(null);
    const credential = credentials[provider.providerId]?.trim();
    try {
      await saveProvider.mutateAsync({ provider, ...(credential ? { credential } : {}) });
      setCredentials((current) => ({ ...current, [provider.providerId]: '' }));
      await queryClient.invalidateQueries({ queryKey: marketDataKeys.providers() });
      setMessage({ type: 'success', text: `${provider.displayName} 配置已保存。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Provider 配置保存失败。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestProvider = async (provider: ProviderManifest) => {
    setBusyAction(`provider-test:${provider.providerId}`);
    setMessage(null);
    const credential = credentials[provider.providerId]?.trim();
    try {
      const result = await testProvider.mutateAsync({ provider, ...(credential ? { credential } : {}) });
      if (result.status !== 'healthy') {
        const details = Object.entries(result.capabilityResults ?? {})
          .filter(([, item]) => item.status !== 'healthy')
          .map(([capability, item]) => `${capability}: ${item.errorCode ?? item.status ?? '失败'}`)
          .join('；');
        throw new Error(details || `Provider 状态：${result.status ?? 'unknown'}`);
      }
      setMessage({ type: 'success', text: `${provider.displayName} 只读连通性测试通过。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Provider 测试失败。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearCredential = async (provider: ProviderManifest) => {
    if (!window.confirm(`确认清除 ${provider.displayName} 的已保存凭证？`)) return;
    setBusyAction(`provider-clear:${provider.providerId}`);
    try {
      await clearCredential.mutateAsync(provider);
      setCredentials((current) => ({ ...current, [provider.providerId]: '' }));
      await queryClient.invalidateQueries({ queryKey: marketDataKeys.providers() });
      setMessage({ type: 'success', text: `${provider.displayName} 凭证已清除。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Provider 凭证清除失败。' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveProvider = async (provider: ProviderManifest) => {
    if (!window.confirm(`确认从所有市场数据路由中移除 ${provider.displayName}？该操作会生成新的 Policy revision。`)) return;
    setBusyAction(`provider-remove:${provider.providerId}`);
    try {
      const result = await removeProvider.mutateAsync(provider);
      if (!result.removed) throw new Error(result.message ?? (result.pending ? 'Policy 尚未在 DSA 生效，请稍后重试。' : 'Provider 未被移除。'));
      if (result.policy) setPolicyDraft(result.policy);
      setMessage({ type: 'success', text: `${provider.displayName} 已从路由移除，并保留 tombstone。` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Provider 移除失败。' });
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
        setMessage({ type: 'success', text: `标的目录已同步至 generation ${result.generation}。` });
        await queryClient.invalidateQueries({ queryKey: marketDataKeys.catalog() });
      } else if (result.id) {
        setCatalogJobId(result.id);
        setMessage({ type: 'success', text: '标的目录同步任务已提交，状态将自动刷新。' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '标的目录同步失败。' });
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
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '标的确认失败。' });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="page-section" aria-labelledby="market-data-title">
      <div className="page-heading">
        <div>
          <p className="kicker">Market Data & Instrument Center</p>
          <h1 id="market-data-title">市场数据与标的中心</h1>
          <p className="page-subtitle">管理 DSA Provider、路由策略、目录同步与已确认的投资标的。</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={busyAction !== null}>刷新状态</Button>
      </div>

      {loadState === 'degraded' && (
        <Alert variant="destructive"><AlertTitle>DSA Control 暂时不可用</AlertTitle><AlertDescription>只读展示已加载的最后状态；保存、测试和目录同步已暂停。</AlertDescription></Alert>
      )}
      {message && <Alert variant={message.type === 'error' ? 'destructive' : 'default'}><AlertDescription>{message.text}</AlertDescription></Alert>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><p className="kicker">Control Policy</p><strong className="mt-2 block text-2xl font-semibold">{policyDraft ? `r${policyDraft.revision}` : '—'}</strong><p className="mt-1 text-sm text-muted-foreground">{policyDraft?.syncState === 'applied' ? '已同步到 DSA' : policyDraft?.syncState === 'pending' ? '等待同步' : '需要检查'}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="kicker">Provider</p><strong className="mt-2 block text-2xl font-semibold">{configuredProviderCount}/{providerDrafts.length || 2}</strong><p className="mt-1 text-sm text-muted-foreground">已启用且已配置凭证</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="kicker">Instrument Catalog</p><strong className="mt-2 block text-2xl font-semibold">{catalog.data?.generation ? `g${catalog.data.generation}` : '—'}</strong><p className="mt-1 text-sm text-muted-foreground">{catalog.data?.instrumentCount ? `${catalog.data.instrumentCount} 个本地标的` : '由 DSA 快照驱动'}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <MarketPolicyPanel policy={policyDraft} providers={providerDrafts} disabled={controlsDisabled} saving={savePolicy.isPending} onChange={setPolicyDraft} onSave={() => void handleSavePolicy()} />
        <MarketProviderPanel providers={providerDrafts} credentials={credentials} disabled={controlsDisabled} busyAction={busyAction} onProviderChange={replaceProvider} onCredentialChange={(providerId, value) => setCredentials((current) => ({ ...current, [providerId]: value }))} onSave={(provider) => void handleSaveProvider(provider)} onTest={(provider) => void handleTestProvider(provider)} onClearCredential={(provider) => void handleClearCredential(provider)} onRemove={(provider) => void handleRemoveProvider(provider)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InstrumentCatalogPanel catalog={catalogJob.data ?? catalog.data ?? null} disabled={controlsDisabled} syncing={syncCatalog.isPending || Boolean(catalogJobId)} searchBusy={instrumentSearch.isFetching} searchResults={instrumentSearch.data ?? []} confirmingId={busyAction?.startsWith('instrument-confirm:') ? busyAction.slice('instrument-confirm:'.length) : null} onSync={() => void handleSyncCatalog()} onSearch={setSubmittedSearch} onConfirm={(instrument) => void handleConfirmInstrument(instrument)} />
        <Card><CardContent className="space-y-4 p-6"><h2 className="m-0 text-xl font-semibold">数据边界</h2><ul className="m-0 space-y-3 pl-5 text-sm text-muted-foreground"><li>Desktop 是市场数据配置的完整入口；Mobile 只读展示组合和风险状态。</li><li>行情、净值和 Bar 保留实际 Provider 与 freshness；不会把缓存伪装成 Provider。</li><li>目录搜索结果只有服务端确认后，才能进入持仓关联边界。</li><li>Control Contract 只在服务端调用 DSA，浏览器不会接触 Control Token。</li></ul></CardContent></Card>
      </div>
    </section>
  );
}
