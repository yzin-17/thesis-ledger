import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  readyRouteTargetsV3,
  routeAvailabilityLabelV3,
  routeKeyIdV3,
  routeTargetMatchesV3,
  type MarketPolicyRouteRowV3,
  type MarketPolicyTargetOptionV3,
} from './market-data-routes-v3.js';
import {
  type MarketRouteCatalogReadV3,
  type ProviderManifest,
  type RouteTarget,
} from './market-data.types.js';
import { targetLabelV3 } from './market-policy-status-v3.js';

const NONE = '__none__';

type TargetChoice = { label: string; value: string; disabled?: boolean };

const targetOptionKey = (target: RouteTarget) =>
  `${encodeURIComponent(target.providerId)}:${encodeURIComponent(target.upstreamSource)}`;

const unreadyTargetReason = (
  catalog: MarketRouteCatalogReadV3 | undefined,
  row: MarketPolicyRouteRowV3,
  target: RouteTarget,
) => {
  const exact = catalog?.entries.find(
    (entry) => routeKeyIdV3(entry.key) === row.id && routeTargetMatchesV3(entry.target, target),
  );
  if (exact && exact.state !== 'ready') return routeAvailabilityLabelV3(exact.state);
  return '当前未就绪';
};

const choicesForRole = (
  role: 'primary' | 'fallback',
  selected: RouteTarget | undefined,
  other: RouteTarget | undefined,
  candidates: MarketPolicyTargetOptionV3[],
  catalog: MarketRouteCatalogReadV3 | undefined,
  row: MarketPolicyRouteRowV3,
  providers: readonly ProviderManifest[],
): TargetChoice[] => {
  const available =
    role === 'fallback'
      ? candidates.filter((option) => !routeTargetMatchesV3(option.target, other))
      : candidates;
  const choices: TargetChoice[] = [
    { label: role === 'primary' ? '未配置' : '不设备用', value: NONE },
    ...available.map((option) => ({ label: option.label, value: option.key })),
  ];
  if (selected && !available.some((option) => routeTargetMatchesV3(option.target, selected))) {
    const reason = unreadyTargetReason(catalog, row, selected);
    choices.push({
      label: `${targetLabelV3(selected, providers)} · ${reason}`,
      value: targetOptionKey(selected),
      disabled: true,
    });
  }
  return choices;
};

export function MarketPolicyTargetSelect({
  row,
  role,
  selected,
  other,
  catalog,
  providers,
  disabled,
  onChange,
}: {
  row: MarketPolicyRouteRowV3;
  role: 'primary' | 'fallback';
  selected: RouteTarget | undefined;
  other: RouteTarget | undefined;
  catalog: MarketRouteCatalogReadV3 | undefined;
  providers: readonly ProviderManifest[];
  disabled: boolean;
  onChange: (target: RouteTarget | null) => void;
}) {
  const candidates = readyRouteTargetsV3(catalog, row.key, providers);
  const choices = choicesForRole(role, selected, other, candidates, catalog, row, providers);
  const value = selected ? targetOptionKey(selected) : NONE;
  const fieldLabel = role === 'primary' ? '主数据源' : '备用数据源';
  const selectable = !disabled && catalog?.status === 'complete';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{fieldLabel}</span>
      <Select
        items={choices}
        value={value}
        disabled={!selectable || (role === 'fallback' && !other)}
        onValueChange={(nextValue) => {
          if (nextValue === NONE) {
            onChange(null);
            return;
          }
          const choice = candidates.find((option) => option.key === nextValue);
          onChange(choice?.target ?? null);
        }}
      >
        <SelectTrigger className="w-full" aria-label={`${row.label} ${fieldLabel}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value} disabled={choice.disabled}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
