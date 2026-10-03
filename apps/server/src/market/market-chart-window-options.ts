import {
  marketChartOptionsV3Schema,
  marketChartOptionsWindowV3Schema,
  type MarketChartOptionsV3,
  type MarketDataBarRouteKeyV3,
  type MarketChartOptionsWindowV3,
} from '@thesis-ledger/schemas';
import { marketRouteContextV3 } from './market-window-selector-v3.js';
import { resolveChartOptionsV3 } from './market-chart-options-v3.js';
import type { MarketChartProofRepository } from './market-chart-proof.repository.js';

/** Availability remains advisory; the reader revalidates before and after acquisition. */
export async function resolveChartWindowOptions(input: {
  identity: { symbol: string; assetType: 'STOCK' | 'ETF' };
  desired: unknown;
  effective: unknown;
  catalog: unknown;
  window: MarketChartOptionsWindowV3;
  proofs: Pick<MarketChartProofRepository, 'findExact'>;
}): Promise<MarketChartOptionsV3> {
  const window = marketChartOptionsWindowV3Schema.parse(input.window);
  const result = resolveChartOptionsV3(
    input.identity,
    input.desired,
    input.effective,
    input.catalog,
  );
  for (const option of result.options) {
    if (option.available) continue;
    const routeKey: MarketDataBarRouteKeyV3 = {
      kind: 'bar',
      market: 'CN',
      assetType: input.identity.assetType,
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: option.adjustment,
    };
    const context = marketRouteContextV3({ ...input, routeKey });
    if (!context.ok) continue;
    const [primary, backup] = context.context.targets;
    if (!primary || !backup?.eligible || !backup.catalogReady) continue;
    let compatibility;
    try {
      compatibility = await input.proofs.findExact({
        routeKey,
        symbol: input.identity.symbol,
        window,
        targets: { primary: primary.target, backup: backup.target },
        desiredRevision: context.context.desiredRevision,
        effectivePolicyRevision: context.context.effectivePolicyRevision,
        catalogRevision: context.context.catalogRevision,
      });
    } catch {
      compatibility = null;
    }
    if (!compatibility) {
      option.reason = 'basis_incompatible';
      continue;
    }
    option.available = true;
    option.reason = null;
    option.availableVia = 'backup';
  }
  return marketChartOptionsV3Schema.parse({ ...result, window });
}
