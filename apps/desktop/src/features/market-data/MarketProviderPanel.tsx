import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProviderManifest } from './market-data.types.js';
import { MarketProviderRow, type MarketProviderRowProps } from './MarketProviderRow.js';

type MarketProviderPanelProps = Omit<MarketProviderRowProps, 'provider'> & {
  refreshing?: boolean;
  providers: ProviderManifest[];
};

export function MarketProviderPanel({ providers, refreshing = false, ...rowProps }: MarketProviderPanelProps) {
  const enabled = providers.filter((provider) => provider.configured && provider.enabled);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>数据源</CardTitle>
            <CardDescription>
              精确能力与路由选项共用目录；需要凭证的来源请先配置凭证，再启用并检查可用性。
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{providers.length} 个来源</Badge>
            <Badge variant="outline">{enabled.length} 个已启用</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ListRefreshRegion refreshing={refreshing} label="正在刷新行情来源" aria-label="DSA 市场数据源">
          <div className="divide-y divide-border">
            {providers.map((provider) => (
              <MarketProviderRow key={provider.providerId} {...rowProps} provider={provider} />
            ))}
          </div>
          {providers.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">暂无数据提供方。</p>
          )}
        </ListRefreshRegion>
      </CardContent>
    </Card>
  );
}
