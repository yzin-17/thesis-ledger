import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketNewsSheet } from './MarketNewsSheet.js';
import { MarketReferenceSheet } from './MarketReferenceSheet.js';

interface MarketDataSectionTabsProps {
  providerPanel: ReactNode;
  policyPanel: ReactNode;
  monitorPanel?: ReactNode;
  defaultSection?: 'routing' | 'monitor';
}

export function MarketDataSectionTabs({
  providerPanel,
  policyPanel,
  monitorPanel,
  defaultSection = 'routing',
}: MarketDataSectionTabsProps) {
  return (
    <Tabs defaultValue={defaultSection}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <TabsList
        variant="line"
        className="w-auto min-w-0 max-w-full justify-start overflow-x-auto"
        aria-label="市场数据功能"
      >
        <TabsTrigger value="routing" className="shrink-0">
          路由策略
        </TabsTrigger>
        <TabsTrigger value="providers" className="shrink-0">
          数据源
        </TabsTrigger>
        <TabsTrigger value="monitor" className="shrink-0">规则监测</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex shrink-0 items-center gap-2" role="group" aria-label="市场查询">
          <MarketReferenceSheet />
          <MarketNewsSheet />
        </div>
      </div>

      <TabsContent value="routing">{policyPanel}</TabsContent>
      <TabsContent value="providers">{providerPanel}</TabsContent>
      <TabsContent value="monitor">{monitorPanel}</TabsContent>
    </Tabs>
  );
}
