import {
  isExactRoutingScope,
  routingScopeId,
  type RoutingAuthoring,
  type RoutingRule,
} from '@thesis-ledger/schemas';
import { exactRoutingScope, sameRoutingRule, winningRoutingRule } from './market-routing-rules.js';

/** 读取只投影旧规则，当前来源及历史保留绑定不重新按目录选取。 */
export function normalizeRoutingInheritance(config: RoutingAuthoring) {
  const legacy = config.rules.filter(
    (rule) => rule.scope.market && !isExactRoutingScope(rule.scope),
  );
  if (!legacy.length) return { config, legacyRuleCount: 0 };
  const rules = new Map<string, RoutingRule>();
  for (const rule of config.rules) {
    if (!rule.scope.market || isExactRoutingScope(rule.scope))
      rules.set(routingScopeId(rule.scope), rule);
  }
  for (const key of config.keys) {
    const winner = winningRoutingRule(config.rules, key);
    if (!winner?.scope.market || isExactRoutingScope(winner.scope)) continue;
    const scope = exactRoutingScope(key);
    rules.set(routingScopeId(scope), {
      scope,
      providers: [...winner.providers],
      ...(winner.upstreamSources ? { upstreamSources: { ...winner.upstreamSources } } : {}),
    });
  }
  const next = [...rules.values()];
  const preserved = config.preserved.map((item) => {
    const previous = winningRoutingRule(config.rules, item.route.key);
    const winner = winningRoutingRule(next, item.route.key);
    if (previous && winner && sameRoutingRule(item.rule, previous))
      return { ...item, rule: winner };
    return item;
  });
  return { config: { ...config, rules: next, preserved }, legacyRuleCount: legacy.length };
}
