import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import {
  providerDisplay,
  providerHealthLabel,
  type ProviderManifest,
} from './market-data.types.js';

import { credentialSourceLabel } from './provider-credentials.js';

const marketNames: Record<string, string> = {
  CN: '中国内地',
  HK: '港股',
  US: '美股',
  JP: '日股',
  KR: '韩股',
  TW: '台股',
};

const providerMarkets = (provider: ProviderManifest) =>
  provider.markets?.map((market) => marketNames[market] ?? market).join('、') ?? '未声明';

export function MarketProviderPanel({
  providers,
  disabled,
  busyAction,
  pendingProviderIds = [],
  onProviderChange,
  onConfigure,
  onTest,
  onRemove,
}: {
  providers: ProviderManifest[];
  disabled: boolean;
  busyAction: string | null;
  pendingProviderIds?: string[];
  onProviderChange: (provider: ProviderManifest) => void;
  onConfigure: (provider: ProviderManifest) => void;
  onTest: (provider: ProviderManifest) => void;
  onRemove: (provider: ProviderManifest) => void;
}) {
  const availableProviders = providers.filter(
    (provider) => provider.configured && provider.enabled,
  );

  const providerRow = (provider: ProviderManifest) => {
    const savingEnabled = pendingProviderIds.includes(provider.providerId);
    const rowDisabled = disabled || savingEnabled;
    const managesCredential = (provider.credentialSchema?.methods.length ?? 0) > 0;
    return (
      <div
        key={provider.providerId}
        className="grid gap-3 py-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm font-medium">{providerDisplay(provider)}</strong>
            <Badge variant={provider.updatedAt ? 'outline' : 'ghost'}>
              {provider.updatedAt ? '手动配置' : 'DSA 默认'}
            </Badge>
            <Badge variant="outline">{providerHealthLabel(provider)}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{credentialSourceLabel(provider)}</span>
            <span>市场：{providerMarkets(provider)}</span>
            {(provider.upstreamSources?.length ?? 0) > 0 && (
              <span>
                上游：{provider.upstreamSources?.map((source) => source.displayName).join('、')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(provider.capabilities).map(([capability, instrumentTypes]) => (
              <Badge key={capability} variant="outline">
                {capability} · {instrumentTypes.join('/')}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="mr-1 flex items-center gap-2 text-sm">
            <span>启用</span>
            <Switch
              variant="risk"
              aria-label={`${provider.displayName} 启用`}
              checked={provider.enabled}
              disabled={rowDisabled}
              onCheckedChange={(checked) => onProviderChange({ ...provider, enabled: checked })}
            >
              <SwitchThumb variant="risk" />
            </Switch>
          </div>
          {savingEnabled && (
            <span role="status" className="text-xs text-muted-foreground">
              保存中…
            </span>
          )}
          {managesCredential && (
            <Button
              type="button"
              size="sm"
              onClick={() => onConfigure(provider)}
              disabled={rowDisabled}
            >
              配置凭证
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onTest(provider)}
            disabled={rowDisabled}
          >
            {busyAction === `provider-test:${provider.providerId}` && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            测试连接
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRemove(provider)}
            disabled={rowDisabled}
          >
            {busyAction === `provider-remove:${provider.providerId}` && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            移除
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>数据源</CardTitle>
            <CardDescription>
              管理启用状态与连通性；路由候选按能力和标的类型自动匹配。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{providers.length} 个来源</Badge>
            <Badge variant="outline">{availableProviders.length} 个可用</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y" aria-label="DSA 市场数据源">
          {providers.map(providerRow)}
        </div>
        {providers.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无 Provider 清单。</p>
        )}
      </CardContent>
    </Card>
  );
}
