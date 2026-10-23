import { Field, FieldLabel, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { MarketPolicyTargetSelect } from './MarketPolicyTargetSelect.js';
import {
  marketPolicyRouteRowsV3,
  policyRouteTargetsV3,
  policyRouteEnabledV3,
  isIndependentMarketFunctionV3,
  readyRouteTargetsV3,
  routeAvailabilityMessageV3,
  routeKeyLabelV3,
  updatePolicyRouteTargetV3,
  updatePolicyRouteEnabledV3,
} from './market-data-routes-v3.js';
import { marketPolicyRouteGroupsV3 } from './market-policy-route-groups-v3.js';
import { effectiveRouteLabelV3 } from './market-policy-status-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';

export function MarketPolicyRoutes({
  policy,
  serverPolicy,
  catalog,
  providers,
  disabled,
  dirty,
  onChange,
}: {
  policy: MarketPolicyDraftV3 | null;
  serverPolicy: MarketPolicyResponse | null;
  catalog: MarketRouteCatalogReadV3 | undefined;
  providers: ProviderManifest[];
  disabled: boolean;
  dirty: boolean;
  onChange: (policy: MarketPolicyDraftV3) => void;
}) {
  if (!policy) {
    return <p className="text-sm text-muted-foreground">正在读取路由策略…</p>;
  }
  const rows = marketPolicyRouteRowsV3(catalog, policy);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {catalog?.status === 'complete'
          ? '当前目录没有可配置的数据能力。'
          : '正在读取路由策略与精确能力目录…'}
      </p>
    );
  }
  return (
    <FieldGroup>
      {marketPolicyRouteGroupsV3(rows).map((group) => (
        <FieldSet key={group.id}>
          <FieldLegend>{group.label}</FieldLegend>
          <div className="divide-y">
            {group.rows.map((row) => {
              const [primary, fallback] = policyRouteTargetsV3(policy, row.key);
              const candidates = readyRouteTargetsV3(catalog, row.key, providers);
              const routeMessage = routeAvailabilityMessageV3(catalog, row.key);
              return (
                <div
                  key={row.id}
                  className="grid gap-4 py-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end"
                >
                  <div className="flex flex-col gap-1 self-center">
                    <strong className="block text-sm font-medium">
                      {routeKeyLabelV3(row.key)}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {effectiveRouteLabelV3(serverPolicy, row, dirty)}
                    </span>
                    {candidates.length === 0 && routeMessage && (
                      <span className="text-xs text-muted-foreground">{routeMessage}</span>
                    )}
                    {isIndependentMarketFunctionV3(row.key) && (
                      <Field className="flex-row items-center justify-between">
                        <FieldLabel><span className="sr-only">{row.label} </span>启用功能</FieldLabel>
                        <Switch
                          variant="risk"
                          aria-label={`${row.label} 启用功能`}
                          checked={policyRouteEnabledV3(policy, row.key)}
                          disabled={disabled || !primary || catalog?.status !== 'complete'}
                          onCheckedChange={(enabled) => onChange(updatePolicyRouteEnabledV3(policy, row.key, enabled))}
                        >
                          <SwitchThumb variant="risk" />
                        </Switch>
                      </Field>
                    )}
                  </div>
                  <MarketPolicyTargetSelect
                    row={row}
                    role="primary"
                    selected={primary}
                    other={fallback}
                    catalog={catalog}
                    providers={providers}
                    disabled={disabled}
                    onChange={(target) =>
                      onChange(updatePolicyRouteTargetV3(policy, row.key, 'primary', target))
                    }
                  />
                  <MarketPolicyTargetSelect
                    row={row}
                    role="fallback"
                    selected={fallback}
                    other={primary}
                    catalog={catalog}
                    providers={providers}
                    disabled={disabled}
                    onChange={(target) =>
                      onChange(updatePolicyRouteTargetV3(policy, row.key, 'fallback', target))
                    }
                  />
                </div>
              );
            })}
          </div>
        </FieldSet>
      ))}
    </FieldGroup>
  );
}
