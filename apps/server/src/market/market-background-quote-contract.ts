import { correlateBackgroundQuotePlan, type BackgroundQuotePlan } from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from '../integration/dsa/dsa.client.js';

export function assertBackgroundQuoteIdentity(
  symbol: string,
  assetType: string | undefined,
  plan?: BackgroundQuotePlan,
) {
  if (plan && (plan.symbol !== symbol || plan.assetType !== assetType))
    throw new DsaError('后台报价计划与标的身份不匹配', 'control-rejected');
}

/** Both admission and execution use Data auth; this cannot edit policy or probe a provider. */
export async function readBackgroundQuote(
  dsa: DsaClient,
  plan: BackgroundQuotePlan,
  signal?: AbortSignal,
) {
  const request = {
    contractVersion: 3 as const,
    consumer: 'thesis-ledger' as const,
    requestId: crypto.randomUUID(),
    symbol: plan.symbol,
    assetType: plan.assetType,
  };
  const raw = await dsa.post<Record<string, unknown>>(
    '/api/v3/thesis-ledger/market/background-quote',
    { ...request, generation: plan.generation },
    1,
    undefined,
    undefined,
    signal,
  );
  const { quote, ...envelope } = raw;
  const actual = correlateBackgroundQuotePlan(request, envelope);
  if (
    actual.generation !== plan.generation ||
    actual.acquisition !== 'public-snapshot' ||
    JSON.stringify(actual.target) !== JSON.stringify(plan.target)
  )
    throw new DsaError('后台来源控制已变化', 'control-rejected');
  if (
    !quote ||
    typeof quote !== 'object' ||
    Array.isArray(quote) ||
    (quote as Record<string, unknown>).provider !== plan.target?.providerId
  )
    throw new DsaError('后台报价来源不匹配', 'invalid-response');
  return quote as Record<string, unknown>;
}
