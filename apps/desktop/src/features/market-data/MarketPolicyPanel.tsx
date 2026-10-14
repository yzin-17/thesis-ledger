import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import { MarketPolicyRoutes } from './MarketPolicyRoutes.js';
import { routeAvailabilityLabelV3, routeCatalogMessageV3 } from './market-data-routes-v3.js';
import { effectivePolicyV3, policySyncLabelV3 } from './market-policy-status-v3.js';
import {
  type MarketPolicyDraftV3,
  type MarketPolicyResponse,
  type MarketRouteCatalogReadV3,
  type ProviderManifest,
} from './market-data.types.js';

export function MarketPolicyPanel({
  policy,
  serverPolicy,
  catalog,
  catalogPending,
  catalogQueryFailed,
  providers,
  disabled,
  saving,
  retrying,
  dirty,
  onChange,
  onSave,
  onRetry,
}: {
  policy: MarketPolicyDraftV3 | null;
  serverPolicy: MarketPolicyResponse | null;
  catalog: MarketRouteCatalogReadV3 | undefined;
  catalogPending: boolean;
  catalogQueryFailed: boolean;
  providers: ProviderManifest[];
  disabled: boolean;
  saving: boolean;
  retrying: boolean;
  dirty: boolean;
  onChange: (policy: MarketPolicyDraftV3) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  const catalogMessage = catalogPending
    ? '正在读取 DSA 精确路由能力目录。'
    : routeCatalogMessageV3(catalog, catalogQueryFailed);
  const effective = effectivePolicyV3(serverPolicy);
  const effectiveRevision = effective?.revision ?? null;
  const effectiveSourceRevision = effective?.sourceDesiredRevision ?? null;
  const canRetry = Boolean(
    serverPolicy && (serverPolicy.syncState !== 'applied' || serverPolicy.effectiveStale),
  );
  let statusBadgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary';
  if (serverPolicy?.syncState === 'rejected') statusBadgeVariant = 'destructive';
  else if (dirty) statusBadgeVariant = 'default';
  const errorMessage =
    !dirty && serverPolicy && serverPolicy.syncState !== 'applied'
      ? routeAvailabilityLabelV3(serverPolicy.lastError?.code ?? 'policy_not_applied')
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>路由策略</CardTitle>
            <CardDescription>
              为每类数据指定主数据源和一个备用数据源；备用仅在主源不可用时接管完整结果。
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>启用路由</span>
            <Switch
              variant="risk"
              aria-label="启用路由"
              checked={policy?.enabled ?? false}
              disabled={disabled || !policy || catalog?.status !== 'complete'}
              onCheckedChange={(checked) => policy && onChange({ ...policy, enabled: checked })}
            >
              <SwitchThumb variant="risk" />
            </Switch>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant}>{policySyncLabelV3(serverPolicy, dirty)}</Badge>
          {serverPolicy && (
            <span className="text-xs text-muted-foreground">
              期望修订：{serverPolicy.revision}
              {dirty
                ? `（保存后为 ${policy?.revision ? policy.revision + 1 : serverPolicy.revision + 1}）`
                : ''}
            </span>
          )}
          {serverPolicy && (
            <span className="text-xs text-muted-foreground">
              生效修订：{effectiveRevision ?? '尚无'}
              {effectiveSourceRevision !== null ? `（对应期望 ${effectiveSourceRevision}）` : ''}
            </span>
          )}
        </div>

        {catalogMessage && (
          <Alert>
            <AlertTitle>{catalogPending ? '正在读取路由能力' : '暂不能修改路由'}</AlertTitle>
            <AlertDescription>{catalogMessage}</AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert variant={serverPolicy?.syncState === 'rejected' ? 'destructive' : 'default'}>
            <AlertTitle>
              {serverPolicy?.syncState === 'rejected' ? '路由尚未应用' : '路由同步状态'}
            </AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <MarketPolicyRoutes
          policy={policy}
          serverPolicy={serverPolicy}
          catalog={catalog}
          providers={providers}
          disabled={disabled}
          dirty={dirty}
          onChange={onChange}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={onSave}
            disabled={disabled || saving || !policy || !dirty || catalog?.status !== 'complete'}
          >
            {saving && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {saving ? '保存中…' : '保存路由策略'}
          </Button>
          {canRetry && !dirty && (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              disabled={disabled || retrying}
            >
              {retrying && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {retrying ? '重试中…' : '重试应用'}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            保存后自动应用新的主备顺序；失败后可显式重试。
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
