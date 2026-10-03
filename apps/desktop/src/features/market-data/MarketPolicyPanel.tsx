import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import { MarketPolicyTargetSelect } from './MarketPolicyTargetSelect.js';
import { MarketPolicyPreset } from './MarketPolicyPreset.js';
import {
  marketPolicyRouteRowsV3,
  policyRouteTargetsV3,
  readyRouteTargetsV3,
  routeAvailabilityLabelV3,
  routeAvailabilityMessageV3,
  routeCatalogMessageV3,
  routeKeyLabelV3,
  updatePolicyRouteTargetV3,
  type MarketPolicyRouteRowV3,
} from './market-data-routes-v3.js';
import {
  effectivePolicyV3,
  effectiveRouteLabelV3,
  policySyncLabelV3,
} from './market-policy-status-v3.js';
import {
  type MarketPolicyDraftV3,
  type MarketPolicyResponse,
  type MarketRouteCatalogReadV3,
  type ProviderManifest,
} from './market-data.types.js';

const savedTargets = (policy: MarketPolicyDraftV3, row: MarketPolicyRouteRowV3) =>
  policyRouteTargetsV3(policy, row.key);

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
  const rows = marketPolicyRouteRowsV3(catalog, policy);
  const catalogMessage = catalogPending
    ? '正在读取 DSA 精确路由能力目录。'
    : routeCatalogMessageV3(catalog, catalogQueryFailed);
  const effective = effectivePolicyV3(serverPolicy);
  const effectiveRevision = effective?.revision ?? null;
  const effectiveSourceRevision = effective?.sourceDesiredRevision ?? null;
  const canRetry = Boolean(serverPolicy && (serverPolicy.syncState !== 'applied' || serverPolicy.effectiveStale));
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

        {policy && (
          <MarketPolicyPreset
            policy={policy}
            catalog={catalog}
            providers={providers}
            disabled={disabled || saving || retrying || catalogPending || catalogQueryFailed}
            onChange={onChange}
          />
        )}

        {policy ? (
          rows.length > 0 ? (
            <div className="divide-y rounded-lg border border-border">
              {rows.map((row) => {
                const [primary, fallback] = savedTargets(policy, row);
                const candidates = readyRouteTargetsV3(catalog, row.key, providers);
                const routeMessage = routeAvailabilityMessageV3(catalog, row.key);
                return (
                  <div
                    key={row.id}
                    className="grid gap-4 p-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end"
                  >
                    <div className="flex flex-col gap-1 self-center">
                      <strong className="block text-sm font-medium">
                        {routeKeyLabelV3(row.key)}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {effectiveRouteLabelV3(serverPolicy, row, dirty)}
                      </span>
                      {candidates.length === 0 && routeMessage && (
                        <span className="text-xs text-muted-foreground">{routeMessage}</span>
                      )}
                    </div>
                    <MarketPolicyTargetSelect
                      row={row}
                      role="primary"
                      selected={primary}
                      other={fallback}
                      catalog={catalog}
                      providers={providers}
                      disabled={disabled}
                      onChange={(target) =>
                        onChange(updatePolicyRouteTargetV3(policy, row.key, 'primary', target))
                      }
                    />
                    <MarketPolicyTargetSelect
                      row={row}
                      role="fallback"
                      selected={fallback}
                      other={primary}
                      catalog={catalog}
                      providers={providers}
                      disabled={disabled}
                      onChange={(target) =>
                        onChange(updatePolicyRouteTargetV3(policy, row.key, 'fallback', target))
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {catalog?.status === 'complete'
                ? '当前目录没有可配置的数据能力。'
                : '正在读取路由策略与精确能力目录…'}
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">正在读取路由策略…</p>
        )}

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
