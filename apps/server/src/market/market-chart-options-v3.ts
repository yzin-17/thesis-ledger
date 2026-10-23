import {
  desiredProviderPolicyV3Schema,
  marketChartOptionsV3Schema,
  marketRouteKeyIdV3,
  type MarketChartOptionsV3,
  type MarketDataBarRouteKeyV3,
  type MarketChartOptionsWindowV3,
} from '@thesis-ledger/schemas';
import { marketRouteContextV3 } from './market-window-selector-v3.js';
import { supportsBasicPriceFallback } from './market-basic-price-fallback.js';
import { marketRouteMarket } from './market-symbol-identity.js';

export const unavailableChartOptions = (
  symbol: string,
  mode: MarketChartOptionsV3['mode'],
  reason: NonNullable<MarketChartOptionsV3['options'][number]['reason']>,
  window?: MarketChartOptionsWindowV3,
  timeframe?: '1m' | '1d',
): MarketChartOptionsV3 => ({
  contractVersion: 3,
  symbol,
  mode,
  ...(timeframe === '1m' ? { timeframe } : {}),
  ...(window ? { window } : {}),
  options: (['none', 'qfq', 'hfq'] as const).map((adjustment) => ({
    adjustment,
    available: false,
    reason,
  })),
});

/** Readiness is an exact route declaration, not a promise of a requested window's coverage. */
export const resolveChartOptionsV3 = (
  identity: { symbol: string; assetType: 'STOCK' | 'ETF'; timeframe?: '1m' | '1d' },
  desired: unknown,
  effective: unknown,
  catalog: unknown,
): MarketChartOptionsV3 => {
  const parsed = desiredProviderPolicyV3Schema.safeParse(desired);
  if (!parsed.success) return unavailableChartOptions(identity.symbol, 'v3', 'policy_not_applied', undefined, identity.timeframe);
  if (!parsed.data.enabled) return unavailableChartOptions(identity.symbol, 'v3', 'disabled', undefined, identity.timeframe);
  const options = (['none', 'qfq', 'hfq'] as const).map((adjustment) => {
    if (identity.timeframe === '1m' && adjustment !== 'none')
      return { adjustment, available: false, reason: 'unsupported_adjustment' as const };
    const routeKey: MarketDataBarRouteKeyV3 = {
      kind: 'bar',
      market: marketRouteMarket(identity.symbol),
      assetType: identity.assetType,
      capability: identity.timeframe === '1m' ? 'MINUTE_BAR' : 'DAILY_BAR',
      timeframe: identity.timeframe ?? '1d',
      adjustment,
    };
    const context = marketRouteContextV3({ desired: parsed.data, effective, catalog, routeKey });
    let reason: MarketChartOptionsV3['options'][number]['reason'] = null;
    let availableVia: 'backup' | undefined;
    if (!context.ok) {
      reason = context.reason === 'policy_mismatch' ? 'policy_not_applied' : context.reason;
    } else {
      const [primary, backup] = context.context.targets;
      if (!primary) reason = 'route_not_configured';
      else if (!primary.eligible) {
        const effectiveRoute = context.context.effective.routes.find(
          (route) => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(routeKey),
        );
        reason = effectiveRoute?.targets[0]?.reason ?? 'not_admitted';
      } else if (!primary.catalogReady) {
        const entry = context.context.catalog.entries.find(
          (entry) =>
            marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(routeKey) &&
            entry.target.providerId === primary.target.providerId &&
            entry.target.upstreamSource === primary.target.upstreamSource,
        );
        reason =
          entry?.state === 'ready' ? 'not_admitted' : (entry?.state ?? 'catalog_unavailable');
      }
      if (reason && primary && backup?.eligible && backup.catalogReady &&
        supportsBasicPriceFallback(routeKey, [primary.target, backup.target], context.context.catalog)) {
        reason = null;
        availableVia = 'backup';
      }
    }
    return { adjustment, available: reason === null, reason, ...(availableVia ? { availableVia } : {}) };
  });
  return marketChartOptionsV3Schema.parse({
    contractVersion: 3,
    symbol: identity.symbol,
    mode: 'v3',
    ...(identity.timeframe === '1m' ? { timeframe: '1m' } : {}),
    options,
  });
};
