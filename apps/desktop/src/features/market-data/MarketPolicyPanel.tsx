import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MarketPolicyRoutes } from './MarketPolicyRoutes.js';
import { MarketPolicyActions } from './MarketPolicyActions.js';
import { policySyncLabelV3 } from './market-policy-status-v3.js';
import { marketPolicyPanelStateV3 } from './market-policy-panel-state-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
  ProviderManifest,
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
  const { draft, changedIds, catalogMessage, canRetry, errorMessage, statusBadgeVariant } =
    marketPolicyPanelStateV3({
      policy,
      serverPolicy,
      catalog,
      catalogPending,
      catalogQueryFailed,
      dirty,
    });
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {catalogMessage && (
        <Alert>
          {catalogPending && <Spinner aria-hidden="true" />}
          <AlertTitle>{catalogPending ? '正在读取路由能力' : '暂不能修改路由'}</AlertTitle>
          <AlertDescription>{catalogMessage}</AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Alert variant={serverPolicy?.syncState === 'rejected' ? 'destructive' : 'default'}>
          <AlertTitle>路由尚未应用</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <MarketPolicyRoutes
        policy={draft}
        serverPolicy={serverPolicy}
        catalog={catalog}
        providers={providers}
        disabled={disabled || catalog?.status !== 'complete' || saving || retrying}
        changedIds={changedIds}
        onChange={onChange}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusBadgeVariant}>{policySyncLabelV3(serverPolicy, dirty)}</Badge>
            <MarketPolicyActions
              disabled={disabled}
              saving={saving}
              retrying={retrying}
              dirty={dirty}
              canRetry={canRetry}
              canSave={Boolean(draft && dirty && catalog?.status === 'complete')}
              count={changedIds.size}
              onSave={onSave}
              onRetry={onRetry}
            />
          </div>
        }
      />
    </div>
  );
}
