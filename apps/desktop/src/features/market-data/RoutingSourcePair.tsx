import type {
  MarketRouteCapabilityV3,
  RoutingAuthoring,
  RoutingScope,
} from '@thesis-ledger/schemas';
import { MarketPolicyChoice } from './MarketPolicyFilters.js';
import { FieldGroup } from '@/components/ui/field';
import { routingInheritedRule } from './routing-config-draft.js';
import {
  routingSourceChoices,
  routingSourceValue,
  updateRoutingSourceChoice,
} from './routing-source-choices.js';
import { dataSourceDisplay, type ProviderManifest } from './market-data.types.js';

export function RoutingSourcePair({
  config,
  scope,
  catalog,
  providers,
  onChange,
  label,
  compact = false,
}: {
  config: RoutingAuthoring;
  scope: RoutingScope;
  catalog: MarketRouteCapabilityV3[];
  providers: ProviderManifest[];
  onChange: (config: RoutingAuthoring) => void;
  label: string;
  compact?: boolean;
}) {
  const rule = routingInheritedRule(config, scope);
  const value = rule?.providers ?? [];
  const items = routingSourceChoices(providers, catalog, scope, rule);
  return (
    <FieldGroup className="grid min-w-0 gap-3 sm:grid-cols-2">
      {([0, 1] as const).map((index) => (
        <MarketPolicyChoice
          key={index}
          compact={compact}
          label={label + (index === 0 ? '主数据源' : '备用数据源')}
          value={routingSourceValue(rule, value[index], items)}
          placeholder={`${dataSourceDisplay(value[index] ?? '', null, providers)} · 请选择具体来源`}
          disabled={index === 1 && !value[0]}
          items={[
            { value: '__none__', label: index === 0 ? '未配置' : '不设备用' },
            ...items.filter((item) => item.providerId !== value[1 - index]),
          ]}
          onChange={(next) =>
            onChange(
              updateRoutingSourceChoice(
                config,
                scope,
                index,
                items.find((item) => item.value === next) ?? null,
              ),
            )
          }
        />
      ))}
    </FieldGroup>
  );
}
