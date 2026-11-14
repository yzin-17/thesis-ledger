import { useEffect, useState } from 'react';
import { marketRouteKeyIdV3, type MarketRouteCapabilityV3, type RoutingAuthoring,
  type RoutingRule, type RoutingScope } from '@thesis-ledger/schemas';
import { routingInheritedRule, routingScopeMatchesKey } from './routing-config-draft.js';
import { routingRecommendation, type RoutingRecommendationDecision } from './routing-recommendation.js';
import { eligibleRecommendationCandidates } from './routing-recommendation-selection.js';
import { routingProviderChoices } from './routing-source-choices.js';
import type { ProviderManifest } from './market-data.types.js';

const binding = (rule?: RoutingRule) => JSON.stringify([rule?.providers ?? [], rule?.upstreamSources ?? {}]);
export function projectRecommendationDecisions(
  config: RoutingAuthoring, decisions: RoutingRecommendationDecision[], eligible: MarketRouteCapabilityV3[],
) {
  return decisions.map((decision) => {
    if (decision.status !== 'pending') return decision;
    const current = routingInheritedRule(config, decision.scope);
    if (!current?.providers.length || binding(current) === binding(decision.original)) return decision;
    const key = config.keys.find((item) => routingScopeMatchesKey(decision.scope, item));
    const exact = eligible.filter((item) => key && marketRouteKeyIdV3(item.key) === marketRouteKeyIdV3(key));
    const resolved = current.providers.every((id) => current.upstreamSources?.[id]
      && exact.some((item) => item.target.providerId === id && item.target.upstreamSource === current.upstreamSources![id]));
    return resolved ? { ...decision, status: 'selected' as const, reason: '已手动选择符合条件的具体来源' } : decision;
  });
}

type Adoption = { before: RoutingRule[]; decisions: RoutingRecommendationDecision[] };
export function useRoutingRecommendation(
  config: RoutingAuthoring | null, revision: number | undefined, providers: ProviderManifest[],
  catalog: MarketRouteCapabilityV3[], change: (next: RoutingAuthoring) => void,
) {
  const [adoptions, setAdoptions] = useState<Partial<Record<RoutingScope['category'], Adoption>>>({});
  useEffect(() => { setAdoptions({}); }, [revision]);
  const eligible = eligibleRecommendationCandidates(providers, catalog,
    new Set(routingProviderChoices(providers).map((item) => item.value)), Date.now());
  const decisions = Object.fromEntries(Object.entries(adoptions).map(([category, adoption]) =>
    [category, config ? projectRecommendationDecisions(config, adoption.decisions, eligible) : []])) as
    Partial<Record<RoutingScope['category'], RoutingRecommendationDecision[]>>;
  return {
    decisions,
    pending: Object.values(decisions).flat().filter((item) => item.status === 'pending').length,
    adopt: (category: RoutingScope['category']) => {
      if (!config) return;
      const result = routingRecommendation(config, category, providers, catalog);
      setAdoptions((current) => ({ ...current, [category]: {
        before: current[category]?.before ?? config.rules.filter((rule) => rule.scope.category === category),
        decisions: result.decisions,
      } }));
      change(result.config);
    },
    undo: (category: RoutingScope['category']) => {
      const adoption = adoptions[category];
      if (!config || !adoption) return;
      change({ ...config, rules: [...config.rules.filter((rule) => rule.scope.category !== category), ...adoption.before] });
      setAdoptions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== category)));
    },
  };
}
