import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import {
  providerDisplay,
  providerHealthLabel,
  type ProviderManifest,
  type MarketRouteCatalogReadV3,
} from './market-data.types.js';
import { providerExactCapabilities } from './market-provider-capabilities.js';

import { credentialSourceLabel } from './provider-credentials.js';

import { isLocalHistoryProvider } from './market-local-history.js';

export interface MarketProviderRowProps {
  provider: ProviderManifest;
  catalog?: MarketRouteCatalogReadV3 | undefined;
  disabled: boolean;
  busyAction: string | null;
  pendingProviderIds?: string[];
  onProviderChange: (provider: ProviderManifest) => void;
  onConfigure: (provider: ProviderManifest) => void;
  onTest: (provider: ProviderManifest) => void;
  onRemove: (provider: ProviderManifest) => void;
}

export function MarketProviderRow({
  provider,
  catalog,
  disabled,
  busyAction,
  pendingProviderIds = [],
  onProviderChange,
  onConfigure,
  onTest,
  onRemove,
}: MarketProviderRowProps) {
  const savingEnabled = pendingProviderIds.includes(provider.providerId);
  const rowDisabled = disabled || savingEnabled;
  const credentialMissing = provider.requiresCredential === true && !provider.credentialConfigured;
  const managesCredential = (provider.credentialSchema?.methods.length ?? 0) > 0;
  const capabilities = providerExactCapabilities(provider, catalog);
  const local = isLocalHistoryProvider(provider);
  let checkLabel = '测试连接';
  if (local) checkLabel = '检查资料包';
  else if (provider.accountAccessSupported) checkLabel = '检查功能权限';
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
          {(provider.upstreamSources?.length ?? 0) > 0 && (
            <span>
              {local ? '资料类型：' : '上游：'}
              {provider.upstreamSources?.map((source) => source.displayName).join('、')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {capabilities?.map((capability) => (
            <Badge key={capability.id} variant="outline">
              {capability.label} · {capability.state}
            </Badge>
          ))}
          {capabilities === null && (
            <span className="text-xs text-muted-foreground">精确能力目录尚未加载</span>
          )}
          {capabilities?.length === 0 && (
            <span className="text-xs text-muted-foreground">当前合同尚无精确接入</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <div className="mr-1 flex items-center gap-2 text-sm">
          <span>启用</span>
          <Switch
            variant="risk"
            aria-label={`${provider.displayName} 启用`}
            checked={provider.enabled && !credentialMissing}
            disabled={rowDisabled || credentialMissing}
            onCheckedChange={(checked) => {
              if (checked && credentialMissing) return;
              onProviderChange({ ...provider, enabled: checked });
            }}
          >
            <SwitchThumb variant="risk" />
          </Switch>
        </div>
        {credentialMissing && <span className="text-xs text-muted-foreground">请先配置凭证</span>}
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
          {checkLabel}
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
}
