import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';
import {
  routeCandidates,
  routeDefinitions,
  routeLabel,
  type MarketPolicy,
  type ProviderManifest,
} from './market-data.types.js';

export function MarketPolicyPanel({
  policy,
  providers,
  disabled,
  saving,
  onChange,
  onSave,
}: {
  policy: MarketPolicy | null;
  providers: ProviderManifest[];
  disabled: boolean;
  saving: boolean;
  onChange: (policy: MarketPolicy) => void;
  onSave: () => void;
}) {
  const updateRoute = (capability: string, instrumentType: string, providerId: string) => {
    if (!policy) return;
    const current = routeCandidates(policy, capability, instrumentType);
    const next = current.includes(providerId)
      ? current.filter((candidate) => candidate !== providerId)
      : [...current, providerId];
    onChange({
      ...policy,
      routes: {
        ...policy.routes,
        [capability]: { ...policy.routes[capability], [instrumentType]: next },
      },
    });
  };

  const moveRoute = (
    capability: string,
    instrumentType: string,
    providerId: string,
    direction: -1 | 1,
  ) => {
    if (!policy) return;
    const candidates = [...routeCandidates(policy, capability, instrumentType)];
    const index = candidates.indexOf(providerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= candidates.length) return;
    [candidates[index], candidates[target]] = [candidates[target]!, candidates[index]!];
    onChange({
      ...policy,
      routes: {
        ...policy.routes,
        [capability]: { ...policy.routes[capability], [instrumentType]: candidates },
      },
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">Provider 路由策略</h2>
            <p className="mt-1 text-sm text-muted-foreground">每个能力/标的类型独立排序；数据记录不会混用字段。</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={policy?.enabled ?? false}
              disabled={disabled || !policy}
              onChange={(event) => policy && onChange({ ...policy, enabled: event.target.checked })}
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
                    <strong className="block text-sm font-medium">{routeLabel(capability, instrumentType)}</strong>
                    <span className="font-mono text-xs text-muted-foreground">{capability} / {instrumentType}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {providers.map((provider) => {
                      const routeIndex = candidates.indexOf(provider.providerId);
                      return (
                        <div key={provider.providerId} className="flex items-center gap-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={routeIndex >= 0}
                              disabled={disabled}
                              onChange={() => updateRoute(capability, instrumentType, provider.providerId)}
                            />
                            {routeIndex >= 0 ? `${routeIndex + 1}. ` : ''}{provider.displayName}
                          </label>
                          {routeIndex >= 0 && (
                            <span className="flex gap-1">
                              <Button type="button" size="sm" variant="ghost" disabled={disabled || routeIndex === 0} aria-label={`${provider.displayName} 上移`} onClick={() => moveRoute(capability, instrumentType, provider.providerId, -1)}>↑</Button>
                              <Button type="button" size="sm" variant="ghost" disabled={disabled || routeIndex === candidates.length - 1} aria-label={`${provider.displayName} 下移`} onClick={() => moveRoute(capability, instrumentType, provider.providerId, 1)}>↓</Button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {providers.length === 0 && <span className="text-sm text-muted-foreground">Provider 状态不可用</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">正在读取路由策略…</p>}
        {policy?.lastError && <p className="text-sm text-destructive">最近同步错误：{policy.lastError.message ?? policy.lastError.code}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSave} disabled={disabled || !policy}>
            {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {saving ? '提交中…' : `提交下一版策略${policy ? `（r${policy.revision + 1}）` : ''}`}
          </Button>
          <span className="text-xs text-muted-foreground">同一 revision 的内容冲突会被拒绝。</span>
        </div>
      </CardContent>
    </Card>
  );
}
