import { useMemo, useState } from 'react';
import {
  marketPolicyCategories,
  routingScopeId,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
  type RoutingDiagnostic,
  type RoutingScope,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { RoutingScopeRange } from './RoutingScopeRange.js';
import { RoutingScopeList } from './RoutingScopeList.js';
import {
  emptyRoutingFilter,
  filterRoutingScopes,
  routingFlatScopes,
} from './routing-flat-scopes.js';
import type { ProviderManifest } from './market-data.types.js';

export function RoutingScopeSheet({
  category,
  pendingScopes,
  config,
  diagnostics,
  providers,
  catalog,
  disabled,
  canPreview,
  onChange,
  onPreview,
  onClose,
}: {
  category: RoutingScope['category'];
  pendingScopes: RoutingScope[] | undefined;
  config: RoutingAuthoring;
  diagnostics: RoutingDiagnostic[];
  providers: ProviderManifest[];
  catalog: MarketRouteCapabilityV3[];
  disabled: boolean;
  canPreview: boolean;
  onChange: (config: RoutingAuthoring) => void;
  onPreview: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState({ ...emptyRoutingFilter });
  const rows = useMemo(() => {
    const all = routingFlatScopes(config, category);
    if (!pendingScopes) return all;
    const pendingIds = new Set(pendingScopes.map(routingScopeId));
    return all.filter(({ scope }) => pendingIds.has(routingScopeId(scope)));
  }, [config, category, pendingScopes]);
  const visibleRows = filterRoutingScopes(rows, filter);
  const sourceProps = { config, catalog, diagnostics, providers, disabled, onChange };
  const selectedCategory = marketPolicyCategories.find((item) => item.id === category)!;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="detail" className="gap-4 overflow-hidden max-sm:w-full max-sm:max-w-full">
        <SheetHeader>
          <SheetTitle>{selectedCategory.label} · 细分配置</SheetTitle>
          <SheetDescription>
            {pendingScopes ? '仅显示待选择项，修改后统一保存。' : '筛选配置范围，直接选择主备，修改后统一保存。'}
          </SheetDescription>
        </SheetHeader>
        <RoutingScopeRange
          rows={rows}
          filter={filter}
          count={visibleRows.length}
          onChange={setFilter}
        />
        <SheetBody className="relative flex flex-col gap-3 overscroll-contain">
          <RoutingScopeList {...sourceProps} rows={visibleRows} />
          <p className="m-0 text-xs text-muted-foreground">保存前将检查覆盖情况。</p>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            返回主配置
          </Button>
          <Button disabled={disabled || !canPreview} onClick={onPreview}>
            保存配置
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
