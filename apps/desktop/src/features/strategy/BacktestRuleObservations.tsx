import { backtestRuleDiagnosticDisplay } from '@thesis-ledger/domain';
import { backtestRuleDiagnosticsSchema } from '@thesis-ledger/schemas';

export function BacktestRuleObservations({ value }: { value: unknown }) {
  const parsed = backtestRuleDiagnosticsSchema.safeParse(value);
  if (!parsed.success) return null;
  return <section className="flex flex-col gap-3" aria-label="条件观测与下单资格">
    <h3 className="text-xl font-semibold">条件观测与下单资格</h3>
    {backtestRuleDiagnosticDisplay(parsed.data).map((rule) => <div key={rule.id} className="flex flex-col gap-1 text-sm">
      <p className="font-medium">{rule.label}</p>
      <p>{rule.summary}</p>
      {rule.reasons.map((reason) => <p key={reason} className="text-muted-foreground">{reason}</p>)}
    </div>)}
  </section>;
}
