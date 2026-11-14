import type { RoutingDiagnostic, RoutingScope } from '@thesis-ledger/schemas';
import { routeAvailabilityLabelV3, routeKeyLabelV3 } from './market-data-routes-v3.js';
import { routingScopeMatchesKey } from './routing-config-draft.js';
import { routingProviderChoices } from './routing-source-choices.js';
import type { ProviderManifest } from './market-data.types.js';

export function RoutingScopeIssues({
  scope,
  diagnostics,
  providers,
}: {
  scope: RoutingScope;
  diagnostics: RoutingDiagnostic[];
  providers: ProviderManifest[];
}) {
  if (!scope.capability) return null;
  const entries = diagnostics.filter(
    (entry) => routingScopeMatchesKey(scope, entry.key) && entry.reasons.length > 0,
  );
  if (!entries.length) return null;
  const choices = routingProviderChoices(providers);
  const message = (reason: string) => {
    const [id, code] = reason.split(':');
    const name = choices.find((choice) => choice.value === id)?.label ?? id;
    if (code === 'not_covered') return `${name}未覆盖该能力`;
    if (code === 'ambiguous_binding') return `${name}有多个可用来源，请选择具体来源`;
    return `${name}：${routeAvailabilityLabelV3(code ?? '')}`;
  };
  return (
    <div
      className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
      aria-label="最近覆盖检查"
    >
      {entries.map((entry) => (
        <p key={JSON.stringify(entry.key)} className="m-0 break-words">
          {entries.length > 1 && `${routeKeyLabelV3(entry.key)}：`}
          {entry.reasons.map(message).join('；')}
        </p>
      ))}
    </div>
  );
}
