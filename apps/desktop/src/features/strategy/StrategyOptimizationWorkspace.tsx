import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StrategyOptimizationExperimentPanel } from './StrategyOptimizationExperimentPanel.js';
import { StrategyRiskApplicationPanel } from './StrategyRiskApplicationPanel.js';
import type { StrategyRecord } from './strategy.types.js';

export function StrategyOptimizationWorkspace({ strategies }: { strategies: StrategyRecord[] }) {
  return (
    <Tabs defaultValue="ai" className="space-y-4">
      <TabsList>
        <TabsTrigger value="ai">AI 优化</TabsTrigger>
        <TabsTrigger value="risk">策略风险规则</TabsTrigger>
      </TabsList>
      <TabsContent value="ai">
        <StrategyOptimizationExperimentPanel strategies={strategies} />
      </TabsContent>
      <TabsContent value="risk">
        <StrategyRiskApplicationPanel strategies={strategies} />
      </TabsContent>
    </Tabs>
  );
}
