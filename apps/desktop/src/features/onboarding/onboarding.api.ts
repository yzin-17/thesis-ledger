import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import {
  hasConfiguredProviderSetup,
  type OnboardingMarketData,
  type OnboardingProviderRecord,
  type OnboardingRiskRuleRecord,
} from './onboarding.types.js';
import type { MarketPolicy, ProviderManifest } from '../market-data/market-data.types.js';

export interface OnboardingStatus {
  hasProviderSetup: boolean;
  hasRiskRule: boolean;
}

export const fetchOnboardingStatus = async (
  client?: DesktopRequestClient,
): Promise<OnboardingStatus> => {
  const [providers, rules, marketProviders, marketPolicy] = await Promise.all([
    requestDesktopJson<OnboardingProviderRecord[]>('/providers/config', undefined, client),
    requestDesktopJson<OnboardingRiskRuleRecord[]>('/risk/rules', undefined, client),
    requestDesktopJson<{ providers?: ProviderManifest[] }>(
      '/market-data/providers',
      undefined,
      client,
    ),
    requestDesktopJson<MarketPolicy>('/market-data/policy', undefined, client),
  ]);
  const marketData: OnboardingMarketData = {
    providers: marketProviders.providers ?? [],
    policy: marketPolicy,
  };
  return {
    hasProviderSetup: hasConfiguredProviderSetup(providers, marketData),
    hasRiskRule: rules.some((rule) => rule.enabled === true),
  };
};
