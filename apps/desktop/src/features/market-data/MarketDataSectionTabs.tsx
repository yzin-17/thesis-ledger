import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MarketDataSectionTabsProps {
  providerPanel: ReactNode;
  policyPanel: ReactNode;
  catalogPanel: ReactNode;
}

export function MarketDataSectionTabs({
  providerPanel,
  policyPanel,
  catalogPanel,
}: MarketDataSectionTabsProps) {
  return (
    <Tabs defaultValue="routing" className="mt-6 gap-4">
      <TabsList
        variant="line"
        className="w-full justify-start overflow-x-auto"
        aria-label="市场数据功能"
      >
        <TabsTrigger value="routing" className="shrink-0">
          路由策略
        </TabsTrigger>
        <TabsTrigger value="providers" className="shrink-0">
          数据源
        </TabsTrigger>
        <TabsTrigger value="catalog" className="shrink-0">
          标的目录
        </TabsTrigger>
      </TabsList>

      <TabsContent value="routing">{policyPanel}</TabsContent>
      <TabsContent value="providers">{providerPanel}</TabsContent>
      <TabsContent value="catalog">{catalogPanel}</TabsContent>
    </Tabs>
  );
}
