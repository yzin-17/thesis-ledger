import type { RoutingDiagnostic, RoutingScope } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { routingScopeMatchesKey, routingStateLabels } from './routing-config-draft.js';

export function RoutingScopeCoverage({
  scope,
  diagnostics,
}: {
  scope: RoutingScope;
  diagnostics: RoutingDiagnostic[];
}) {
  const entries = diagnostics.filter((entry) => routingScopeMatchesKey(scope, entry.key));
  if (!entries.length) return null;
  const states = ['uncovered', 'unavailable', 'ambiguous', 'single_source'] as const;
  const counts = states
    .map((state) => ({ state, count: entries.filter((entry) => entry.state === state).length }))
    .filter((item) => item.count);
  if (!counts.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {counts.map((item) => (
        <Badge key={item.state} variant="outline">
          {routingStateLabels[item.state]}
          {entries.length > 1 && ` ${item.count}`}
        </Badge>
      ))}
    </div>
  );
}
