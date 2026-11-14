import { useState } from 'react';
import { RoutingConfigNotices } from './RoutingConfigNotices.js';
import {
  marketPolicyCategories,
  type RoutingScope,
  type MarketRouteCapabilityV3,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/spinner';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { useRoutingConfig } from './useRoutingConfig.js';
import { RoutingSourcePair } from './RoutingSourcePair.js';
import { RoutingScopeSheet } from './RoutingScopeSheet.js';
import { RoutingPreviewSheet } from './RoutingPreviewSheet.js';
import { LocalMaterialsSheet } from './LocalMaterialsSheet.js';
import {
  routingScopeMatchesKey,
  routingStateLabels,
  routingConfigStatusLabel,
  routingCanPreview,
} from './routing-config-draft.js';
import type { ProviderManifest } from './market-data.types.js';
import { useRoutingRecommendation } from './useRoutingRecommendation.js';
import { RoutingRecommendationReview } from './RoutingRecommendationReview.js';
import { projectRoutingCoverage } from './routing-coverage-projection.js';

export function RoutingConfigPanel({
  providers,
  catalog,
  disabled,
  onRetry,
  refreshing = false,
}: {
  providers: ProviderManifest[];
  catalog: MarketRouteCapabilityV3[];
  disabled: boolean;
  onRetry: () => void;
  refreshing?: boolean;
}) {
  const state = useRoutingConfig();
  const recommendations = useRoutingRecommendation(state.draft, state.baseline?.revision, providers, catalog, state.change);
  const [scopeSheet, setScopeSheet] = useState<{
    category: RoutingScope['category']; pendingOnly: boolean;
  } | null>(null);
  const [localDetails, setLocalDetails] = useState(false);
  if (!state.draft || !state.baseline) {
    if (state.query.isError)
      return (
        <Alert variant="destructive">
          <AlertDescription>
            分级路由暂时无法读取。
            <Button variant="outline" size="sm" onClick={() => void state.query.refetch()}>
              重新加载
            </Button>
          </AlertDescription>
        </Alert>
      );
    return <LoadingState label="正在读取分级路由" />;
  }
  const { draft, baseline } = state;
  const blocked = disabled || state.busy || baseline.catalogStatus !== 'complete';
  const {
    diagnostics,
    pendingCategories,
  } = projectRoutingCoverage(draft, baseline, state.preview);
  const error = state.previewMutation.error ?? state.saveMutation.error;
  const errorMessage = error
    ? requestFailureMessage(error, '配置提交失败，请保留草稿后重试')
    : null;
  const statusLabel = routingConfigStatusLabel(state.dirty, baseline.syncState);
  const canPreview = routingCanPreview(
    state.dirty,
    baseline.pendingChanges,
    baseline.legacyRuleCount,
  );
  return (
    <ListRefreshRegion
      className="flex min-w-0 flex-col gap-4"
      refreshing={state.query.isFetching || refreshing}
      label="正在刷新分级路由"
    >
      <RoutingConfigNotices state={state} errorMessage={errorMessage} blocked={blocked} />
      <fieldset disabled={blocked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        {marketPolicyCategories
          .filter(
            (item) =>
              item.id !== 'other' ||
              draft.keys.some((key) => routingScopeMatchesKey({ category: 'other' }, key)),
          )
          .map((item) => {
            const scope = { category: item.id };
            const entries = diagnostics.filter((entry) => routingScopeMatchesKey(scope, entry.key));
            const keyCount = draft.keys.filter((key) => routingScopeMatchesKey(scope, key)).length;
            const exceptions = draft.rules.filter(
              (candidate) => candidate.scope.category === item.id && candidate.scope.market,
            ).length;
            return (
              <section
                key={item.id}
                className="grid min-w-0 gap-3 border-b pb-4 last:border-b-0 lg:grid-cols-[220px_minmax(0,1fr)]"
                aria-label={item.label}
              >
                <div className="flex flex-col items-start gap-2">
                  <h2 className="m-0 text-xl font-semibold text-foreground">{item.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {keyCount} 项口径 · {exceptions} 项单独配置
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setScopeSheet({ category: item.id, pendingOnly: false })}>
                    细分配置<span className="sr-only">{item.label}</span>
                  </Button>
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <RoutingSourcePair
                    label={item.label}
                    providers={providers}
                    config={draft}
                    scope={scope}
                    catalog={catalog}
                    onChange={state.change}
                  />
                  <RoutingRecommendationReview
                    decisions={recommendations.decisions[item.id]}
                    onAdopt={() => recommendations.adopt(item.id)}
                    onUndo={() => recommendations.undo(item.id)}
                    onSelectPending={() => setScopeSheet({ category: item.id, pendingOnly: true })}
                  >
                    {pendingCategories.has(item.id) && <Badge variant="outline">待保存</Badge>}
                    {Object.entries(routingStateLabels).map(([kind, label]) => {
                      const count = entries.filter((entry) => entry.state === kind).length;
                      return count > 0 ? (
                        <Badge key={kind} variant="outline">
                          {label} {count}
                        </Badge>
                      ) : null;
                    })}
                  </RoutingRecommendationReview>
                </div>
              </section>
            );
          })}
      </fieldset>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3 max-[520px]:bottom-20">
        <Button variant="outline" onClick={() => setLocalDetails(true)}>
          查看本地资料
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{statusLabel}</Badge>
          {baseline.syncState !== 'applied' && (
            <Button variant="outline" disabled={blocked || state.dirty} onClick={onRetry}>
              重试应用
            </Button>
          )}
          <Button disabled={blocked || !canPreview} onClick={() => state.previewMutation.mutate()}>
            {state.previewMutation.isPending ? '正在检查配置' : '保存配置'}
          </Button>
        </div>
      </div>
      {scopeSheet && (
        <RoutingScopeSheet
          key={scopeSheet.category}
          category={scopeSheet.category}
          pendingScopes={scopeSheet.pendingOnly
            ? (recommendations.decisions[scopeSheet.category] ?? [])
              .filter((decision) => decision.status === 'pending').map((decision) => decision.scope)
            : undefined}
          config={draft}
          diagnostics={diagnostics}
          providers={providers}
          catalog={catalog}
          disabled={blocked}
          canPreview={canPreview}
          onChange={state.change}
          onPreview={() => {
            setScopeSheet(null);
            state.previewMutation.mutate();
          }}
          onClose={() => setScopeSheet(null)}
        />
      )}
      {state.preview && (
        <RoutingPreviewSheet
          preview={state.preview}
          pendingRecommendations={recommendations.pending}
          saving={state.saveMutation.isPending}
          error={errorMessage}
          onClose={state.closePreview}
          onSave={() => state.saveMutation.mutate()}
        />
      )}
      {localDetails && (
        <LocalMaterialsSheet providers={providers} onClose={() => setLocalDetails(false)} />
      )}
    </ListRefreshRegion>
  );
}
