import {
  routingScopeId,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
  type RoutingDiagnostic,
  type RoutingScope,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RoutingSourcePair } from './RoutingSourcePair.js';
import { RoutingScopeCoverage } from './RoutingScopeCoverage.js';
import { RoutingScopeIssues } from './RoutingScopeIssues.js';
import { updateRoutingScope } from './routing-config-draft.js';
import { routingScopeOverrides, routingScopePath } from './routing-scope-tree.js';
import type { ProviderManifest } from './market-data.types.js';

export const routingSourceColumns =
  'grid min-w-0 gap-3 sm:grid-cols-[minmax(150px,0.9fr)_minmax(0,2fr)]';
export type RoutingScopeSourceProps = {
  config: RoutingAuthoring;
  catalog: MarketRouteCapabilityV3[];
  diagnostics: RoutingDiagnostic[];
  providers: ProviderManifest[];
  disabled: boolean;
  onChange: (config: RoutingAuthoring) => void;
};

export function RoutingScopeSourceRow({
  scope,
  label,
  className,
  ...props
}: RoutingScopeSourceProps & {
  scope: RoutingScope;
  label: string;
  className?: string;
}) {
  const { config, catalog, diagnostics, providers, disabled, onChange } = props;
  const own = config.rules.find((rule) => routingScopeId(rule.scope) === routingScopeId(scope));
  const exceptions = routingScopeOverrides(config, scope);
  let status = '';
  if (scope.market && own) status = '单独设置';
  else if (scope.market) status = '继承大类配置';
  const path = routingScopePath(scope);
  const showIssues =
    scope.adjustment ||
    (scope.capability && scope.capability !== 'DAILY_BAR' && scope.capability !== 'MINUTE_BAR');
  return (
    <div
      className={cn(
        routingSourceColumns,
        'items-start border-b border-border px-2 py-3',
        className,
      )}
      data-slot="routing-source-row"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="py-1 text-sm font-medium text-foreground">{label}</span>
        {(status || exceptions > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {status && <span>{status}</span>}
            {exceptions > 0 && <span>保留 {exceptions} 项细分</span>}
            {own && scope.market && (
              <Button
                variant="outline"
                size="xs"
                disabled={disabled}
                className="text-foreground"
                onClick={() => onChange(updateRoutingScope(config, scope, null))}
                aria-label={`使用上级配置${path}`}
              >
                使用上级配置
              </Button>
            )}
          </div>
        )}
        <RoutingScopeCoverage scope={scope} diagnostics={diagnostics} />
      </div>
      <fieldset
        disabled={disabled}
        aria-label={path + '数据源'}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
      >
        <RoutingSourcePair
          compact
          label=""
          providers={providers}
          scope={scope}
          config={config}
          catalog={catalog}
          onChange={onChange}
        />
        {showIssues && (
          <RoutingScopeIssues scope={scope} diagnostics={diagnostics} providers={providers} />
        )}
      </fieldset>
    </div>
  );
}
