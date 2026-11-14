import {
  marketRouteKeyIdV3,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
  type RoutingRule,
  type RoutingScope,
} from '@thesis-ledger/schemas';
import { routingInheritedRule, routingScopeMatchesKey } from './routing-config-draft.js';
import { routingProviderChoices } from './routing-source-choices.js';
import type { ProviderManifest } from './market-data.types.js';
import {
  backupCandidates,
  backupReason,
  eligibleRecommendationCandidates,
  selectPreferredCandidate,
} from './routing-recommendation-selection.js';

export type RoutingRecommendationDecision = {
  scope: RoutingScope;
  status: 'selected' | 'pending' | 'uncovered';
  reason: string;
  original: RoutingRule | undefined;
};

type RecommendationSelection = ReturnType<typeof selectPreferredCandidate>;
type RecommendationCandidates = ReturnType<typeof eligibleRecommendationCandidates>;
type RecommendationResult = { rule: RoutingRule; decision: RoutingRecommendationDecision };
function pendingRecommendation(
  scope: RoutingScope,
  original: RoutingRule | undefined,
  exact: RecommendationCandidates,
  main: RecommendationSelection,
  backup: RecommendationSelection | undefined,
): RecommendationResult {
  const retained = Boolean(
    original?.providers.length &&
    original.providers.every(
      (id) =>
        original.upstreamSources?.[id] &&
        exact.some(
          (entry) =>
            entry.target.providerId === id &&
            entry.target.upstreamSource === original.upstreamSources![id],
        ),
    ),
  );
  const rule = { ...original, scope, providers: original?.providers ?? [] };
  let reason = !main.entry ? main.reason : backup!.reason;
  if (retained) reason = '推荐候选条件相同，保留现有已选来源';
  return { rule, decision: { scope, original, status: retained ? 'selected' : 'pending', reason } };
}
function selectedRecommendation(
  scope: RoutingScope,
  original: RoutingRule | undefined,
  main: RecommendationSelection,
  backup: RecommendationSelection | undefined,
): RecommendationResult {
  const selected = [main.entry, backup?.entry].filter((entry) => entry !== undefined);
  const rule = {
    scope,
    providers: selected.map((entry) => entry.target.providerId),
    upstreamSources: Object.fromEntries(
      selected.map((entry) => [entry.target.providerId, entry.target.upstreamSource]),
    ),
  };
  let reason = main.reason;
  if (main.entry && backup?.entry)
    reason += `；备用${backupReason(main.entry, backup.entry)}，${backup.reason}`;
  else if (main.entry) reason += '；仅一个合格提供方';
  return {
    rule,
    decision: { scope, original, status: main.entry ? 'selected' : 'uncovered', reason },
  };
}

export function routingRecommendation(
  config: RoutingAuthoring,
  category: RoutingScope['category'],
  providers: ProviderManifest[],
  catalog: MarketRouteCapabilityV3[],
  now = Date.now(),
) {
  const root = { category };
  const preference =
    config.rules.find((rule) => rule.scope.category === category && !rule.scope.market)
      ?.providers ?? [];
  const keys = config.keys.filter((key) => routingScopeMatchesKey(root, key));
  const candidates = eligibleRecommendationCandidates(
    providers,
    catalog,
    new Set(routingProviderChoices(providers).map((item) => item.value)),
    now,
  );
  const rules: RoutingRule[] = [];
  const decisions: RoutingRecommendationDecision[] = [];
  for (const key of keys) {
    const scope: RoutingScope = {
      category,
      market: key.market,
      assetType: key.assetType,
      capability: key.capability,
      ...(key.kind === 'bar' ? { timeframe: key.timeframe, adjustment: key.adjustment } : {}),
    };
    const original = routingInheritedRule(config, scope);
    const current = (index: number) => {
      const providerId = original?.providers[index];
      return providerId
        ? { providerId, upstreamSource: original?.upstreamSources?.[providerId] }
        : undefined;
    };
    const exact = candidates.filter(
      (entry) => marketRouteKeyIdV3(entry.key) === marketRouteKeyIdV3(key),
    );
    const main = selectPreferredCandidate(exact, preference, current(0));
    const backup = main.entry
      ? selectPreferredCandidate(
          backupCandidates(main.entry, exact),
          preference.slice(1),
          current(1),
        )
      : undefined;
    const pending =
      (!main.entry && main.choices.length > 1) ||
      (!backup?.entry && (backup?.choices.length ?? 0) > 1);
    if (pending) {
      const result = pendingRecommendation(scope, original, exact, main, backup);
      rules.push(result.rule);
      decisions.push(result.decision);
      continue;
    }
    const result = selectedRecommendation(scope, original, main, backup);
    rules.push(result.rule);
    decisions.push(result.decision);
  }
  const available = new Set(
    candidates
      .filter((entry) => routingScopeMatchesKey(root, entry.key))
      .map((entry) => entry.target.providerId),
  );
  let defaults = preference.filter((id) => available.has(id));
  if (!defaults.length && rules.length && decisions.every((item) => item.status !== 'pending'))
    defaults = rules[0]!.providers.filter((id) =>
      rules.every((rule) => rule.providers.includes(id)),
    );
  return {
    config: {
      ...config,
      rules: [
        ...config.rules.filter((rule) => rule.scope.category !== category),
        { scope: root, providers: defaults },
        ...rules,
      ],
    },
    decisions,
  };
}

export function applyRoutingRecommendation(
  ...args: Parameters<typeof routingRecommendation>
): RoutingAuthoring {
  return routingRecommendation(...args).config;
}
