import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';

type RouteMatrix = Record<string, Record<string, string[]>>;
type SyncState = 'pending' | 'applied' | 'rejected' | 'unknown';

interface MarketPolicy {
  revision: number;
  enabled: boolean;
  routes: RouteMatrix;
  syncState: SyncState;
  dsaRevision?: number | null;
  lastError?: { code?: string; message?: string } | null;
  effectiveProjection?: Record<string, unknown> | null;
}

interface ProviderManifest {
  providerId: string;
  displayName: string;
  version: number;
  capabilities: Record<string, string[]>;
  configured: boolean;
  enabled: boolean;
  credentialConfigured: boolean;
  requiresCredential?: boolean;
  updatedAt?: string | null;
  health?: {
    scopes?: Array<{ state?: string; circuit?: string; errorCode?: string | null }>;
  };
}

interface InstrumentResult {
  id: string;
  symbol: string;
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
  confirmable: boolean;
  disabledReason?: string;
}

interface CatalogStatus {
  generation: number;
  checksum?: string;
  instrumentCount?: number;
}

const routeDefinitions = [
  ['REALTIME_QUOTE', 'STOCK', '实时行情'],
  ['REALTIME_QUOTE', 'ETF', 'ETF 实时行情'],
  ['DAILY_BAR', 'STOCK', '日线 Bar'],
  ['DAILY_BAR', 'ETF', 'ETF 日线 Bar'],
  ['FUND_NAV', 'MUTUAL_FUND', '基金单位净值'],
  ['FUND_NAV_HISTORY', 'MUTUAL_FUND', '基金净值历史'],
] as const;

const providerDisplay = (provider: ProviderManifest) =>
  `${provider.displayName} (${provider.providerId})`;

const providerHealthLabel = (provider: ProviderManifest) => {
  const scopes = provider.health?.scopes ?? [];
  if (scopes.some((scope) => scope.circuit === 'open')) return '熔断';
  if (scopes.some((scope) => scope.state === 'degraded')) return '降级';
  if (scopes.some((scope) => scope.state === 'healthy')) return '健康';
  return provider.credentialConfigured ? '待检查' : '未配置';
};

const responseMessage = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    detail?: { message?: string };
  } | null;
  return body?.message ?? body?.detail?.message ?? `请求失败（${response.status}）`;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return (await response.json()) as T;
}

const routeCandidates = (policy: MarketPolicy, capability: string, instrumentType: string) =>
  policy.routes[capability]?.[instrumentType] ?? [];

const routeLabel = (capability: string, instrumentType: string) =>
  routeDefinitions.find(
    ([itemCapability, itemType]) => itemCapability === capability && itemType === instrumentType,
  )?.[2] ?? `${capability} / ${instrumentType}`;

export function MarketDataSettings() {
  const [policy, setPolicy] = useState<MarketPolicy | null>(null);
  const [providers, setProviders] = useState<ProviderManifest[]>([]);
  const [catalog, setCatalog] = useState<CatalogStatus | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'degraded'>('loading');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<InstrumentResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);

  const controlsDisabled = loadState !== 'ready' || busyAction !== null;
  const configuredProviderCount = useMemo(
    () => providers.filter((provider) => provider.configured && provider.enabled).length,
    [providers],
  );

  const load = async () => {
    setLoadState('loading');
    setMessage(null);
    const [policyResult, providersResult, catalogResult] = await Promise.allSettled([
      requestJson<MarketPolicy>('/api/v1/market-data/policy'),
      requestJson<{ providers?: ProviderManifest[] }>('/api/v1/market-data/providers'),
      requestJson<CatalogStatus>('/api/v1/market-data/catalog/status'),
    ]);
    if (policyResult.status === 'fulfilled') setPolicy(policyResult.value);
    if (providersResult.status === 'fulfilled') setProviders(providersResult.value.providers ?? []);
    if (catalogResult.status === 'fulfilled') setCatalog(catalogResult.value);
    const failed = [policyResult, providersResult, catalogResult].some(
      (result) => result.status === 'rejected',
    );
    setLoadState(failed ? 'degraded' : 'ready');
    if (failed)
      setMessage({
        type: 'error',
        text: 'Control Contract 暂时不可用，当前页面保留最后已知状态。',
      });
  };

  useEffect(() => {
    void load();
  }, []);

  const updateRoute = (capability: string, instrumentType: string, providerId: string) => {
    setPolicy((current) => {
      if (!current) return current;
      const currentCandidates = routeCandidates(current, capability, instrumentType);
      const nextCandidates = currentCandidates.includes(providerId)
        ? currentCandidates.filter((candidate) => candidate !== providerId)
        : [...currentCandidates, providerId];
      return {
        ...current,
        routes: {
          ...current.routes,
          [capability]: {
            ...current.routes[capability],
            [instrumentType]: nextCandidates,
          },
        },
      };
    });
  };

  const moveRoute = (
    capability: string,
    instrumentType: string,
    providerId: string,
    direction: -1 | 1,
  ) => {
    setPolicy((current) => {
      if (!current) return current;
      const candidates = [...routeCandidates(current, capability, instrumentType)];
      const index = candidates.indexOf(providerId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= candidates.length) return current;
      [candidates[index], candidates[target]] = [candidates[target]!, candidates[index]!];
      return {
        ...current,
        routes: {
          ...current.routes,
          [capability]: {
            ...current.routes[capability],
            [instrumentType]: candidates,
          },
        },
      };
    });
  };

  const savePolicy = async () => {
    if (!policy) return;
    setBusyAction('policy-save');
    setMessage(null);
    try {
      const saved = await requestJson<MarketPolicy>('/api/v1/market-data/policy', {
        method: 'PUT',
        body: JSON.stringify({
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: crypto.randomUUID(),
          revision: policy.revision + 1,
          enabled: policy.enabled,
          routes: policy.routes,
        }),
      });
      setPolicy(saved);
      setMessage({ type: 'success', text: `路由策略已提交，revision ${saved.revision}。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '路由策略提交失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const saveProvider = async (provider: ProviderManifest) => {
    setBusyAction(`provider-save:${provider.providerId}`);
    setMessage(null);
    try {
      const credential = credentials[provider.providerId]?.trim();
      await requestJson(
        `/api/v1/market-data/providers/${encodeURIComponent(provider.providerId)}/config`,
        {
          method: 'POST',
          body: JSON.stringify({
            enabled: provider.enabled,
            ...(credential ? { credential } : {}),
          }),
        },
      );
      setCredentials((current) => ({ ...current, [provider.providerId]: '' }));
      setProviders((current) =>
        current.map((item) =>
          item.providerId === provider.providerId
            ? {
                ...item,
                configured: !provider.requiresCredential || Boolean(credential) || item.configured,
                credentialConfigured: Boolean(credential) || item.credentialConfigured,
              }
            : item,
        ),
      );
      setMessage({ type: 'success', text: `${provider.displayName} 配置已保存。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Provider 配置保存失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const clearProviderCredential = async (provider: ProviderManifest) => {
    if (!window.confirm(`确认清除 ${provider.displayName} 的已保存凭证？`)) return;
    setBusyAction(`provider-clear:${provider.providerId}`);
    setMessage(null);
    try {
      await requestJson(
        `/api/v1/market-data/providers/${encodeURIComponent(provider.providerId)}/config`,
        {
          method: 'POST',
          body: JSON.stringify({ enabled: provider.enabled, clearCredentials: true }),
        },
      );
      setCredentials((current) => ({ ...current, [provider.providerId]: '' }));
      setProviders((current) =>
        current.map((item) =>
          item.providerId === provider.providerId
            ? {
                ...item,
                configured: !item.requiresCredential,
                credentialConfigured: false,
              }
            : item,
        ),
      );
      setMessage({ type: 'success', text: `${provider.displayName} 凭证已清除。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Provider 凭证清除失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const testProvider = async (provider: ProviderManifest) => {
    setBusyAction(`provider-test:${provider.providerId}`);
    setMessage(null);
    try {
      const credential = credentials[provider.providerId]?.trim();
      const result = await requestJson<{
        status?: string;
        capabilityResults?: Record<string, { status?: string; errorCode?: string }>;
      }>(`/api/v1/market-data/providers/${encodeURIComponent(provider.providerId)}/test`, {
        method: 'POST',
        body: JSON.stringify(credential ? { credential } : {}),
      });
      if (result.status !== 'healthy') {
        const failedCapabilities = Object.entries(result.capabilityResults ?? {})
          .filter(([, item]) => item.status !== 'healthy')
          .map(([capability, item]) => `${capability}: ${item.errorCode ?? item.status ?? '失败'}`)
          .join('；');
        throw new Error(failedCapabilities || `Provider 状态：${result.status ?? 'unknown'}`);
      }
      setMessage({ type: 'success', text: `${provider.displayName} 只读连通性测试通过。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Provider 测试失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const removeProvider = async (provider: ProviderManifest) => {
    if (
      !window.confirm(
        `确认从所有市场数据路由中移除 ${provider.displayName}？该操作会生成新的 Policy revision。`,
      )
    )
      return;
    setBusyAction(`provider-remove:${provider.providerId}`);
    setMessage(null);
    try {
      const result = await requestJson<{
        removed?: boolean;
        pending?: boolean;
        message?: string;
        policy?: MarketPolicy;
        routeDiff?: unknown[];
      }>(`/api/v1/market-data/providers/${encodeURIComponent(provider.providerId)}/remove`, {
        method: 'POST',
      });
      if (result.policy) setPolicy(result.policy);
      if (!result.removed) {
        throw new Error(
          result.message ??
            (result.pending
              ? 'Policy 尚未在 DSA 生效，Provider 未被移除，请稍后重试。'
              : 'Provider 未被移除。'),
        );
      }
      setProviders((current) =>
        current.map((item) =>
          item.providerId === provider.providerId
            ? { ...item, enabled: false, configured: false, credentialConfigured: false }
            : item,
        ),
      );
      setMessage({
        type: 'success',
        text: `${provider.displayName} 已从路由移除，并保留 tombstone。`,
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

  const syncCatalog = async () => {
    setBusyAction('catalog-sync');
    setMessage(null);
    try {
      const result = await requestJson<CatalogStatus & { acknowledged?: boolean }>(
        '/api/v1/market-data/catalog/sync',
        {
          method: 'POST',
        },
      );
      setCatalog(result);
      setMessage({ type: 'success', text: `标的目录已同步至 generation ${result.generation}。` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '标的目录同步失败。',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const searchInstruments = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchText.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchBusy(true);
    try {
      const result = await requestJson<InstrumentResult[]>(
        `/api/v1/market-data/instruments/search?q=${encodeURIComponent(searchText.trim())}`,
      );
      setSearchResults(result);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '标的搜索失败。',
      });
    } finally {
      setSearchBusy(false);
    }
  };

  const confirmInstrument = async (instrument: InstrumentResult) => {
    setBusyAction(`instrument-confirm:${instrument.id}`);
    try {
      await requestJson(
        `/api/v1/market-data/instruments/${encodeURIComponent(instrument.id)}/confirm`,
        {
          method: 'POST',
        },
      );
      setSearchResults((current) =>
        current.map((item) => (item.id === instrument.id ? { ...item, confirmable: false } : item)),
      );
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
    <section className="page-section" aria-labelledby="market-data-title">
      <div className="page-heading">
        <div>
          <p className="kicker">Market Data & Instrument Center</p>
          <h1 id="market-data-title">市场数据与标的中心</h1>
          <p className="page-subtitle">管理 DSA Provider、路由策略、目录同步与已确认的投资标的。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={busyAction !== null}
        >
          刷新状态
        </Button>
      </div>

      {loadState === 'degraded' && (
        <Alert variant="destructive">
          <AlertTitle>DSA Control 暂时不可用</AlertTitle>
          <AlertDescription>
            只读展示已加载的最后状态；保存、测试和目录同步已暂停。
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="kicker">Control Policy</p>
            <strong className="mt-2 block text-2xl font-semibold">
              {policy ? `r${policy.revision}` : '—'}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              {policy?.syncState === 'applied'
                ? '已同步到 DSA'
                : policy?.syncState === 'pending'
                  ? '等待同步'
                  : '需要检查'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="kicker">Provider</p>
            <strong className="mt-2 block text-2xl font-semibold">
              {configuredProviderCount}/{providers.length || 2}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">已启用且已配置凭证</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="kicker">Instrument Catalog</p>
            <strong className="mt-2 block text-2xl font-semibold">
              {catalog?.generation ? `g${catalog.generation}` : '—'}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              {catalog?.instrumentCount
                ? `${catalog.instrumentCount} 个本地标的`
                : '由 DSA 快照驱动'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="m-0 text-xl font-semibold">Provider 路由策略</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  每个能力/标的类型独立排序；数据记录不会混用字段。
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy?.enabled ?? false}
                  disabled={controlsDisabled || !policy}
                  onChange={(event) =>
                    setPolicy((current) =>
                      current ? { ...current, enabled: event.target.checked } : current,
                    )
                  }
                />
                启用路由
              </label>
            </div>
            {policy ? (
              <div className="divide-y border-y border-border">
                {routeDefinitions.map(([capability, instrumentType]) => {
                  const candidates = routeCandidates(policy, capability, instrumentType);
                  return (
                    <div
                      key={`${capability}:${instrumentType}`}
                      className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center"
                    >
                      <div>
                        <strong className="block text-sm font-medium">
                          {routeLabel(capability, instrumentType)}
                        </strong>
                        <span className="font-mono text-xs text-muted-foreground">
                          {capability} / {instrumentType}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {providers.map((provider) => {
                          const routeIndex = candidates.indexOf(provider.providerId);
                          return (
                            <div
                              key={provider.providerId}
                              className="flex items-center gap-2 text-sm"
                            >
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={routeIndex >= 0}
                                  disabled={controlsDisabled}
                                  onChange={() =>
                                    updateRoute(capability, instrumentType, provider.providerId)
                                  }
                                />
                                {routeIndex >= 0 ? `${routeIndex + 1}. ` : ''}
                                {provider.displayName}
                              </label>
                              {routeIndex >= 0 && (
                                <span className="flex gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={controlsDisabled || routeIndex === 0}
                                    aria-label={`${provider.displayName} 上移`}
                                    onClick={() =>
                                      moveRoute(capability, instrumentType, provider.providerId, -1)
                                    }
                                  >
                                    ↑
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={
                                      controlsDisabled || routeIndex === candidates.length - 1
                                    }
                                    aria-label={`${provider.displayName} 下移`}
                                    onClick={() =>
                                      moveRoute(capability, instrumentType, provider.providerId, 1)
                                    }
                                  >
                                    ↓
                                  </Button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {providers.length === 0 && (
                          <span className="text-sm text-muted-foreground">Provider 状态不可用</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">正在读取路由策略…</p>
            )}
            {policy?.lastError && (
              <p className="text-sm text-destructive">
                最近同步错误：{policy.lastError.message ?? policy.lastError.code}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void savePolicy()}
                disabled={controlsDisabled || !policy}
              >
                {busyAction === 'policy-save' && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {busyAction === 'policy-save'
                  ? '提交中…'
                  : `提交下一版策略${policy ? `（r${policy.revision + 1}）` : ''}`}
              </Button>
              <span className="text-xs text-muted-foreground">
                同一 revision 的内容冲突会被拒绝。
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="m-0 text-xl font-semibold">Provider 配置</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  凭证只写入 DSA；留空保存会保留已存凭证。
                </p>
              </div>
              <Badge variant="outline">Control Token</Badge>
            </div>
            <div className="space-y-4">
              {providers.map((provider) => (
                <div
                  key={provider.providerId}
                  className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="block text-sm font-medium">
                        {providerDisplay(provider)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {!provider.requiresCredential
                          ? '无需凭证'
                          : provider.credentialConfigured
                            ? '凭证已配置'
                            : '未配置凭证'}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        健康：{providerHealthLabel(provider)}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={provider.enabled}
                        disabled={controlsDisabled}
                        onChange={(event) =>
                          setProviders((current) =>
                            current.map((item) =>
                              item.providerId === provider.providerId
                                ? { ...item, enabled: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      启用
                    </label>
                  </div>
                  {provider.requiresCredential && (
                    <Input
                      type="password"
                      value={credentials[provider.providerId] ?? ''}
                      disabled={controlsDisabled}
                      placeholder="留空以保留已保存凭证"
                      autoComplete="new-password"
                      onChange={(event) =>
                        setCredentials((current) => ({
                          ...current,
                          [provider.providerId]: event.target.value,
                        }))
                      }
                      aria-label={`${provider.displayName} 凭证`}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveProvider(provider)}
                      disabled={controlsDisabled}
                    >
                      {busyAction === `provider-save:${provider.providerId}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      保存配置
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void testProvider(provider)}
                      disabled={controlsDisabled}
                    >
                      {busyAction === `provider-test:${provider.providerId}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      只读测试
                    </Button>
                    {provider.requiresCredential && provider.credentialConfigured && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void clearProviderCredential(provider)}
                        disabled={controlsDisabled}
                      >
                        清除凭证
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeProvider(provider)}
                      disabled={controlsDisabled}
                    >
                      {busyAction === `provider-remove:${provider.providerId}` && (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      移除
                    </Button>
                  </div>
                </div>
              ))}
              {providers.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无 Provider 清单。</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="m-0 text-xl font-semibold">标的目录</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  完整快照、generation 与 ACK 由服务端原子切换。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void syncCatalog()}
                disabled={controlsDisabled}
              >
                {busyAction === 'catalog-sync' && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                同步目录
              </Button>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="border border-border p-3">
                <span className="block text-muted-foreground">当前 generation</span>
                <strong className="mt-1 block font-mono">{catalog?.generation ?? '—'}</strong>
              </div>
              <div className="border border-border p-3">
                <span className="block text-muted-foreground">本地标的数量</span>
                <strong className="mt-1 block font-mono">{catalog?.instrumentCount ?? '—'}</strong>
              </div>
            </div>
            <form className="space-y-3" onSubmit={(event) => void searchInstruments(event)}>
              <label className="block text-sm font-medium" htmlFor="instrument-search">
                搜索已同步标的
              </label>
              <div className="flex gap-2">
                <Input
                  id="instrument-search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="代码、名称或拼音首字母"
                />
                <Button type="submit" variant="outline" disabled={searchBusy}>
                  {searchBusy ? '搜索中…' : '搜索'}
                </Button>
              </div>
            </form>
            {searchResults.length > 0 && (
              <div className="divide-y border-y border-border">
                {searchResults.map((instrument) => (
                  <div key={instrument.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-medium">
                        {instrument.displayName}
                      </strong>
                      <span className="font-mono text-xs text-muted-foreground">
                        {instrument.symbol} · {instrument.instrumentType}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!instrument.confirmable || busyAction !== null}
                      onClick={() => void confirmInstrument(instrument)}
                    >
                      {instrument.confirmable ? '确认标的' : '已确认'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="m-0 text-xl font-semibold">数据边界</h2>
            <ul className="m-0 space-y-3 pl-5 text-sm text-muted-foreground">
              <li>Desktop 是市场数据配置的完整入口；Mobile 只读展示组合和风险状态。</li>
              <li>行情、净值和 Bar 保留实际 Provider 与 freshness；不会把缓存伪装成 Provider。</li>
              <li>目录搜索结果只有服务端确认后，才能进入持仓关联边界。</li>
              <li>Control Contract 只在服务端调用 DSA，浏览器不会接触 Control Token。</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
