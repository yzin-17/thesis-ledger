import {
  marketRouteKeyIdV3,
  type DesiredProviderPolicyV3,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
  type RoutingDiagnostic,
} from '@thesis-ledger/schemas';
import { sameRoutingRule, winningRoutingRule } from './market-routing-rules.js';

type Targets = DesiredProviderPolicyV3['routes'][number]['targets'];

function diagnosticState(result: {
  targets: Targets;
  reasons: string[];
}): RoutingDiagnostic['state'] {
  if (result.reasons.some((reason) => reason.endsWith('ambiguous_binding'))) return 'ambiguous';
  if (result.reasons.some((reason) => !reason.endsWith('not_covered'))) return 'unavailable';
  if (!result.targets.length) return 'uncovered';
  if (result.targets.length === 1) return 'single_source';
  return 'covered';
}

function resolveProviders(providers: string[], entries: MarketRouteCapabilityV3[]) {
  const targets: Targets = [];
  const reasons: string[] = [];
  for (const providerId of providers) {
    const candidates = entries.filter((entry) => entry.target.providerId === providerId);
    const ready = [
      ...new Map(
        candidates
          .filter((entry) => entry.state === 'ready')
          .map((entry) => [JSON.stringify(entry.target), entry.target]),
      ).values(),
    ];
    if (ready.length === 1) targets.push(ready[0]!);
    else if (ready.length > 1) reasons.push(`${providerId}:ambiguous_binding`);
    else if (candidates.length)
      reasons.push(...candidates.map((entry) => `${providerId}:${entry.state}`));
    else reasons.push(`${providerId}:not_covered`);
  }
  return { targets, reasons };
}

export function compileRoutingConfig(config: RoutingAuthoring, catalog: MarketRouteCapabilityV3[]) {
  const routes: DesiredProviderPolicyV3['routes'] = [];
  const diagnostics: RoutingDiagnostic[] = [];
  const preserved = new Map(
    config.preserved.map((item) => [marketRouteKeyIdV3(item.route.key), item]),
  );
  for (const key of config.keys) {
    const id = marketRouteKeyIdV3(key);
    const rule = winningRoutingRule(config.rules, key);
    const entries = catalog.filter(
      (entry) =>
        marketRouteKeyIdV3(entry.key) === id &&
        (!rule?.upstreamSources?.[entry.target.providerId] ||
          rule.upstreamSources[entry.target.providerId] === entry.target.upstreamSource),
    );
    let result = resolveProviders(rule?.providers ?? [], entries);
    const original = preserved.get(id);
    if (original && rule && sameRoutingRule(original.rule, rule)) {
      result = { targets: original.route.targets, reasons: [] };
      for (const target of result.targets) {
        const entry = entries.find(
          (item) => JSON.stringify(item.target) === JSON.stringify(target),
        );
        if (!entry || entry.state !== 'ready')
          result.reasons.push(`${target.providerId}:${entry?.state ?? 'not_adapted'}`);
      }
    }
    if (result.targets.length) routes.push({ key, targets: result.targets, enabled: true });
    const state = diagnosticState(result);
    diagnostics.push({ key, state, reasons: result.reasons, inheritedFrom: rule?.scope ?? null });
  }
  return { routes, diagnostics };
}

export function preserveCompiledBindings(
  config: RoutingAuthoring,
  routes: DesiredProviderPolicyV3['routes'],
) {
  return {
    ...config,
    preserved: routes.map((route) => ({
      route,
      rule: winningRoutingRule(config.rules, route.key)!,
    })),
  };
}
