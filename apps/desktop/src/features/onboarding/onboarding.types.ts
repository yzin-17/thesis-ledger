import type { MarketPolicy, ProviderManifest } from '../market-data/market-data.types.js';

export type ImportStep = 'account' | 'position' | 'screenshot';
export type OnboardingNavigationOptions = { step?: ImportStep };

export interface OnboardingProviderRecord {
  enabled?: boolean;
  health?: string;
  credentialConfigured?: boolean;
  capabilities?: unknown;
}

export interface OnboardingMarketData {
  providers: readonly ProviderManifest[];
  policy: Pick<MarketPolicy, 'enabled' | 'routes' | 'syncState'> | null;
}

export interface OnboardingRiskRuleRecord {
  enabled?: boolean;
}

export const isUsableMarketProvider = (provider: ProviderManifest) => {
  const scopes = provider.health?.scopes ?? [];
  return (
    provider.configured === true &&
    provider.enabled !== false &&
    !scopes.some((scope) => scope.state === 'down' || scope.circuit === 'open')
  );
};

export const hasConfiguredDsaQuoteProvider = (marketData?: OnboardingMarketData) => {
  const policy = marketData?.policy;
  if (!policy || policy.enabled !== true || policy.syncState !== 'applied') return false;

  const quoteRoutes = Object.values(policy.routes.REALTIME_QUOTE ?? {});
  return marketData.providers.some(
    (provider) =>
      isUsableMarketProvider(provider) &&
      Array.isArray(provider.capabilities.REALTIME_QUOTE) &&
      provider.capabilities.REALTIME_QUOTE.length > 0 &&
      quoteRoutes.some((providerIds) => providerIds.includes(provider.providerId)),
  );
};

export const hasConfiguredProviderSetup = (
  providers: readonly OnboardingProviderRecord[],
  marketData?: OnboardingMarketData,
) => {
  const configuredProviders = providers.filter(
    (provider) =>
      provider.enabled !== false &&
      provider.health !== 'down' &&
      provider.credentialConfigured === true,
  );
  const hasCapability = (provider: OnboardingProviderRecord, capability: string) =>
    Array.isArray(provider.capabilities) &&
    provider.capabilities.some((item) => String(item) === capability);
  const hasQuoteProvider =
    configuredProviders.some((provider) => hasCapability(provider, 'quote')) ||
    hasConfiguredDsaQuoteProvider(marketData);
  return (
    hasQuoteProvider &&
    configuredProviders.some((provider) => hasCapability(provider, 'notification'))
  );
};
