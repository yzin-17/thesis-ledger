import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';
import {
  providerDisplay,
  providerHealthLabel,
  type ProviderManifest,
} from './market-data.types.js';

export function MarketProviderPanel({
  providers,
  credentials,
  disabled,
  busyAction,
  onProviderChange,
  onCredentialChange,
  onSave,
  onTest,
  onClearCredential,
  onRemove,
}: {
  providers: ProviderManifest[];
  credentials: Record<string, string>;
  disabled: boolean;
  busyAction: string | null;
  onProviderChange: (provider: ProviderManifest) => void;
  onCredentialChange: (providerId: string, value: string) => void;
  onSave: (provider: ProviderManifest) => void;
  onTest: (provider: ProviderManifest) => void;
  onClearCredential: (provider: ProviderManifest) => void;
  onRemove: (provider: ProviderManifest) => void;
}) {
  return (
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
                  <strong className="block text-sm font-medium">{providerDisplay(provider)}</strong>
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
                    disabled={disabled}
                    onChange={(event) =>
                      onProviderChange({ ...provider, enabled: event.target.checked })
                    }
                  />
                  启用
                </label>
              </div>
              {provider.requiresCredential && (
                <Input
                  type="password"
                  value={credentials[provider.providerId] ?? ''}
                  disabled={disabled}
                  placeholder="留空以保留已保存凭证"
                  autoComplete="new-password"
                  onChange={(event) => onCredentialChange(provider.providerId, event.target.value)}
                  aria-label={`${provider.displayName} 凭证`}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSave(provider)}
                  disabled={disabled}
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
                  onClick={() => onTest(provider)}
                  disabled={disabled}
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
                    onClick={() => onClearCredential(provider)}
                    disabled={disabled}
                  >
                    清除凭证
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(provider)}
                  disabled={disabled}
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
  );
}
