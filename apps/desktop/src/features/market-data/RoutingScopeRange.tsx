import { FilterReset } from '@/components/ui/filter-bar';
import { FieldGroup } from '@/components/ui/field';
import { MarketPolicyChoice } from './MarketPolicyFilters.js';
import {
  emptyRoutingFilter,
  routingFilterFields,
  routingScopeFilterItems,
  type RoutingScopeFilter,
} from './routing-flat-scopes.js';
import type { RoutingScopeNode } from './routing-scope-tree.js';

const labels = {
  market: ['市场', '全部市场'],
  assetType: ['标的类型', '全部类型'],
  capability: ['用途', '全部用途'],
  timeframe: ['周期', '全部周期'],
  adjustment: ['复权', '全部口径'],
};

export function RoutingScopeRange({
  rows,
  filter,
  count,
  onChange,
}: {
  rows: RoutingScopeNode[];
  filter: RoutingScopeFilter;
  count: number;
  onChange: (value: RoutingScopeFilter) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <FieldGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {routingFilterFields.map((field) => {
          const items = routingScopeFilterItems(rows, field);
          if (!items.length) return null;
          return (
            <MarketPolicyChoice
              key={field}
              label={labels[field][0]!}
              value={filter[field]}
              items={[{ value: 'all', label: labels[field][1]! }, ...items]}
              onChange={(value) => onChange({ ...filter, [field]: value })}
            />
          );
        })}
      </FieldGroup>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span role="status">显示 {count} 项配置</span>
        <FilterReset
          size="xs"
          className="text-foreground"
          hasConditions={routingFilterFields.some((field) => filter[field] !== 'all')}
          onReset={() => onChange({ ...emptyRoutingFilter })}
        />
      </div>
    </div>
  );
}
