import { backtestRuleDiagnosticDisplay } from '@thesis-ledger/domain';
import { backtestRuleDiagnosticsSchema } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';

export function BacktestRuleObservations({ value }: { value: unknown }) {
  const parsed = backtestRuleDiagnosticsSchema.safeParse(value);
  if (!parsed.success) return null;
  return <Section title="条件观测与下单资格" variant="content">
    {backtestRuleDiagnosticDisplay(parsed.data).map((rule) => <Section key={rule.id} title={rule.label} variant="content">
      <Copy>{rule.summary}</Copy>
      {rule.reasons.map((reason) => <Copy key={reason} muted>{reason}</Copy>)}
    </Section>)}
  </Section>;
}
