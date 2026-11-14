import { useState, type ReactNode } from 'react';
import { LoadingState } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { marketPolicyRouteRowsV3 } from './market-data-routes-v3.js';
import {
  marketPolicyRouteGroupsV3,
  marketPolicyCategoryV3,
  filterMarketPolicyRowsV3,
  type MarketPolicyFilter,
} from './market-policy-route-groups-v3.js';
import { MarketPolicyFilters, MarketPolicyChoice } from './MarketPolicyFilters.js';
import { MarketPolicyRouteTable } from './MarketPolicyRouteTable.js';
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
  changedIds,
  onChange,
  actions,
}: {
  policy: MarketPolicyDraftV3 | null;
  serverPolicy: MarketPolicyResponse | null;
  catalog: MarketRouteCatalogReadV3 | undefined;
  providers: ProviderManifest[];
  disabled: boolean;
  changedIds: ReadonlySet<string>;
  onChange: (policy: MarketPolicyDraftV3) => void;
  actions: ReactNode;
}) {
  const [category, setCategory] = useState('market');
  const [filter, setFilter] = useState<MarketPolicyFilter>({
    market: 'all',
    assetType: 'all',
    search: '',
  });
  if (!policy) return <LoadingState label="正在读取路由策略" />;
  const stored = serverPolicy?.routes ?? [];
  const rows = marketPolicyRouteRowsV3(catalog, {
    ...policy,
    routes: [...stored, ...policy.routes],
  });
  const filtered = filterMarketPolicyRowsV3(rows, filter);
  const groups = marketPolicyRouteGroupsV3(filtered);
  const activeCategory = groups.some((group) => group.id === category) ? category : 'market';
  const current = groups.find((group) => group.id === activeCategory);
  const visible = current?.rows ?? [];
  const visibleChanges = visible.filter((row) => changedIds.has(row.id)).length;
  const hiddenChanges = changedIds.size - visibleChanges;
  const choices = groups.map((group) => ({
    value: group.id,
    label: group.label + '（' + group.rows.length + '）',
  }));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MarketPolicyFilters filter={filter} onChange={setFilter} />
      <Tabs
        value={activeCategory}
        onValueChange={(value) => setCategory(String(value))}
        orientation="vertical"
        className="grid min-w-0 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)]"
      >
        <TabsList
          aria-label="路由能力分类"
          variant="navigation"
          className="hidden w-full lg:flex"
        >
          {groups.map((group) => {
            const changes = rows.filter(
              (row) => changedIds.has(row.id) && marketPolicyCategoryV3(row.key) === group.id,
            ).length;
            return (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="h-auto min-h-10 flex-none justify-between gap-2 whitespace-normal px-3 py-2 text-left"
              >
                <span>
                  {group.label}
                  {changes > 0 && (
                    <span className="block text-xs text-inherit">已修改 {changes} 项</span>
                  )}
                </span>
                <span className="text-xs text-inherit tabular-nums">{group.rows.length}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="min-w-0">
          <MarketPolicyChoice
            className="mb-4 lg:hidden"
            label="数据分类"
            value={activeCategory}
            items={choices}
            onChange={setCategory}
          />
          <TabsContent value={activeCategory} className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">
                {groups.find((group) => group.id === activeCategory)?.label}
              </h2>
              <span className="text-xs text-muted-foreground">
                {visible.length} 条路由，已修改 {visibleChanges} 项
              </span>
            </div>
            {visible.length > 0 ? (
              <MarketPolicyRouteTable
                rows={visible}
                policy={policy}
                serverPolicy={serverPolicy}
                catalog={catalog}
                providers={providers}
                disabled={disabled}
                changedIds={changedIds}
                onChange={onChange}
              />
            ) : (
              <Empty className="border border-dashed p-6">
                <EmptyDescription>当前范围没有此类路由</EmptyDescription>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilter({ market: 'all', assetType: 'all', search: '' })}
                >
                  清除筛选
                </Button>
              </Empty>
            )}
          </TabsContent>
        </div>
      </Tabs>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card py-3 [@media(max-width:520px)]:bottom-20">
        <p className="text-xs text-muted-foreground">
          共修改 {changedIds.size} 项
          {hiddenChanges > 0 && '，其中 ' + hiddenChanges + ' 项不在当前视图'}
        </p>
        {actions}
      </div>
    </div>
  );
}
