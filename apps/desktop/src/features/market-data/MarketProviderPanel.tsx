import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProviderManifest } from './market-data.types.js';
import { MarketProviderRow, type MarketProviderRowProps } from './MarketProviderRow.js';

type MarketProviderPanelProps = Omit<MarketProviderRowProps, 'provider'> & {
  providers: ProviderManifest[];
};

export function MarketProviderPanel({ providers, ...rowProps }: MarketProviderPanelProps) {
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
        <div className="divide-y" aria-label="DSA 市场数据源">
          {providers.map((provider) => (
            <MarketProviderRow key={provider.providerId} {...rowProps} provider={provider} />
          ))}
        </div>
        {providers.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无 Provider 清单。</p>
        )}
      </CardContent>
    </Card>
  );
}
