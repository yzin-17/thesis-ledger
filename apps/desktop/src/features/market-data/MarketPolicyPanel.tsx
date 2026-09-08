import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import {
  compatibleProviders,
  routeCandidates,
  routeDefinitions,
  routeLabel,
  updateRouteRole,
  type MarketPolicy,
  type ProviderManifest,
} from './market-data.types.js';

const NONE = '__none__';

const providerName = (providers: readonly ProviderManifest[], providerId: string | undefined) =>
  providers.find((provider) => provider.providerId === providerId)?.displayName ??
  providerId ??
  '未配置';

const saveLabel = (saving: boolean, policy: MarketPolicy | null) => {
  if (saving) return '提交中…';
  if (policy) return `提交下一版策略（当前第 ${policy.revision} 版）`;
  return '提交下一版策略';
};

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
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">Provider 路由策略</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              为每类数据指定主数据源和一个备用数据源；备用仅在主源不可用时接管完整结果。
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>启用路由</span>
            <Switch
              variant="risk"
              aria-label="启用路由"
              checked={policy?.enabled ?? false}
              disabled={disabled || !policy}
              onCheckedChange={(checked) => policy && onChange({ ...policy, enabled: checked })}
            >
              <SwitchThumb variant="risk" />
            </Switch>
          </div>
        </div>
        {policy ? (
          <div className="divide-y rounded-lg border border-border">
            {routeDefinitions.map(([capability, instrumentType]) => {
              const [primary, fallback] = routeCandidates(policy, capability, instrumentType);
              const compatible = compatibleProviders(providers, capability, instrumentType);
              const fallbackOptions = compatible.filter(
                (provider) => provider.providerId !== primary,
              );
              return (
                <div
                  key={`${capability}:${instrumentType}`}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end"
                >
                  <div className="self-center">
                    <strong className="block text-sm font-medium">
                      {routeLabel(capability, instrumentType)}
                    </strong>
                    <span className="font-mono text-xs text-muted-foreground">
                      {capability} / {instrumentType}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-muted-foreground">
                      主数据源
                    </span>
                    <Select
                      value={primary ?? NONE}
                      disabled={disabled}
                      onValueChange={(value) =>
                        onChange(
                          updateRouteRole(
                            policy,
                            capability,
                            instrumentType,
                            'primary',
                            value === NONE ? null : value,
                          ),
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`${routeLabel(capability, instrumentType)} 主数据源`}
                      >
                        <SelectValue>{providerName(providers, primary)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value={NONE}>未配置</SelectItem>
                          {compatible.map((provider) => (
                            <SelectItem key={provider.providerId} value={provider.providerId}>
                              {provider.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-muted-foreground">
                      备用数据源
                    </span>
                    <Select
                      value={fallback ?? NONE}
                      disabled={disabled || !primary}
                      onValueChange={(value) =>
                        onChange(
                          updateRouteRole(
                            policy,
                            capability,
                            instrumentType,
                            'fallback',
                            value === NONE ? null : value,
                          ),
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`${routeLabel(capability, instrumentType)} 备用数据源`}
                      >
                        <SelectValue>{providerName(providers, fallback)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value={NONE}>不设备用</SelectItem>
                          {fallbackOptions.map((provider) => (
                            <SelectItem key={provider.providerId} value={provider.providerId}>
                              {provider.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
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
          <Button type="button" onClick={onSave} disabled={disabled || !policy}>
            {saving && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {saveLabel(saving, policy)}
          </Button>
          <span className="text-xs text-muted-foreground">保存后由 DSA 原子应用新的主备顺序。</span>
        </div>
      </CardContent>
    </Card>
  );
}
