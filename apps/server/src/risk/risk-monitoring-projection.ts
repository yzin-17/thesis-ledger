import { riskAutomaticMonitoringStatusSchema } from '@thesis-ledger/schemas';

type Rule = {
  id: string;
  version: number;
  sourcePlanId?: string | null;
  symbol?: string | null;
  config?: unknown;
};
type Issue = ReturnType<typeof riskAutomaticMonitoringStatusSchema.parse>['ruleIssues'][number];
const parse = (raw: string | undefined): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function strategyMonitoringIssues(rules: Rule[], health: Record<string, string>): Issue[] {
  const parsed = riskAutomaticMonitoringStatusSchema.shape.ruleIssues.safeParse(
    parse(health.strategyRuleIssues),
  );
  const entries = parsed.success ? parsed.data : [];
  const rawChecked = parse(health.strategyCheckedRules);
  const checked = new Set(
    Array.isArray(rawChecked) ? rawChecked.filter((item) => typeof item === 'string') : [],
  );
  return rules
    .filter((rule) => rule.sourcePlanId)
    .flatMap((rule) => {
      const issue = entries.find(
        (entry) => entry.ruleId === rule.id && entry.ruleVersion === rule.version,
      );
      if (issue) return [issue];
      if (checked.has(`${rule.id}:${rule.version}`)) return [];
      const config = rule.config as { label?: string } | undefined;
      return [
        {
          ruleId: rule.id,
          ruleVersion: rule.version,
          applicationId: rule.sourcePlanId ?? null,
          symbol: rule.symbol ?? null,
          ruleLabel: config?.label ?? '策略风险规则',
          state: 'pending' as const,
          reasonCode: 'evaluation_pending',
          reason: '等待后台完成首次评估',
          checkedAt: null,
        },
      ];
    });
}
