import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import {
  hasConfiguredProviderSetup,
  type OnboardingMarketData,
  type OnboardingProviderRecord,
  type OnboardingRiskRuleRecord,
} from './onboarding.types.js';
import type { ProviderManifest } from '../market-data/market-data.types.js';
import { parseMarketPolicyResponse } from '../market-data/market-data.api.js';

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
      '/api/market-data/providers',
      undefined,
      client,
    ),
    requestDesktopJson<unknown>('/api/market-data/policy', undefined, client),
  ]);
  const marketData: OnboardingMarketData = {
    providers: marketProviders.providers ?? [],
    policy: parseMarketPolicyResponse(marketPolicy),
  };
  return {
    hasProviderSetup: hasConfiguredProviderSetup(providers, marketData),
    hasRiskRule: rules.some((rule) => rule.enabled === true),
  };
};
