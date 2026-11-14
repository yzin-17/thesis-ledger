import { configuredPolicyDraftV3, changedPolicyRouteIdsV3 } from './market-policy-draft-v3.js';
import { routeAvailabilityLabelV3, routeCatalogMessageV3 } from './market-data-routes-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
} from './market-data.types.js';

export function marketPolicyPanelStateV3(input: {
  policy: MarketPolicyDraftV3 | null;
  serverPolicy: MarketPolicyResponse | null;
  catalog: MarketRouteCatalogReadV3 | undefined;
  catalogPending: boolean;
  catalogQueryFailed: boolean;
  dirty: boolean;
}) {
  const { policy, serverPolicy, catalog, catalogPending, catalogQueryFailed, dirty } = input;
  const draft = policy ? configuredPolicyDraftV3(policy) : null;
  const changedIds = draft ? changedPolicyRouteIdsV3(draft, serverPolicy) : new Set<string>();
  const catalogMessage = catalogPending
    ? '正在读取路由能力目录。'
    : routeCatalogMessageV3(catalog, catalogQueryFailed);
  const canRetry = Boolean(
    serverPolicy && (serverPolicy.syncState !== 'applied' || serverPolicy.effectiveStale),
  );
  const errorMessage =
    !dirty && canRetry
      ? routeAvailabilityLabelV3(serverPolicy?.lastError?.code ?? 'policy_not_applied')
      : null;
  let statusBadgeVariant: 'default' | 'secondary' | 'destructive' = 'secondary';
  if (serverPolicy?.syncState === 'rejected') statusBadgeVariant = 'destructive';
  else if (dirty) statusBadgeVariant = 'default';
  return { draft, changedIds, catalogMessage, canRetry, errorMessage, statusBadgeVariant };
}
