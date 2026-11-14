import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StrategyRiskExecutionFields } from '../src/features/strategy/StrategyRiskExecutionFields.js';
import { PerformanceMetrics } from '../src/features/performance/PerformanceMetrics.js';
import { AiProviderExecutionFields } from '../src/features/providers/AiProviderExecutionFields.js';
import { aiProviderDraftFromRecord } from '../src/features/providers/ai-provider.actions.js';
import type { StrategySchema } from '../src/features/strategy/strategy.types.js';
import '../src/ui/styles.css';

function FieldsFixture() {
  const [strategy, setStrategy] = useState<StrategySchema>({
    stopLoss: { type: 'fixed', value: 0.03 },
    sizing: { type: 'weight', value: 0.25 },
    execution: { price: 'nextOpen', lotSize: 100, tPlusOne: false },
    cost: { commissionRate: 0.001, minimumCommission: 5 },
  });
  const [provider, setProvider] = useState(() =>
    aiProviderDraftFromRecord({
      name: '受控用途',
      type: 'ai',
      enabled: false,
      priority: 100,
      capabilities: ['chat'],
      health: 'unknown',
      authMode: 'none',
      models: ['controlled-model'],
      executionRouteConfigs: [
        {
          model: 'controlled-model',
          mode: 'json_mode',
          enabled: true,
          outputPolicy: 'manual',
          contract: { id: 'research', version: 'research-generation-v2' },
        },
      ],
    }),
  );
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4">
      <section aria-label="策略字段" className="space-y-4">
        <StrategyRiskExecutionFields draft={strategy} onChange={setStrategy} />
        <output aria-label="策略草稿" className="sr-only">
          {JSON.stringify(strategy)}
        </output>
      </section>
      <section aria-label="用途字段">
        <AiProviderExecutionFields draft={provider} onUpdateDraft={setProvider} />
        <output aria-label="用途草稿" className="sr-only">
          {JSON.stringify(provider)}
        </output>
      </section>
      <section aria-label="收益摘要">
        <PerformanceMetrics
          latest={undefined}
          summary={null}
          snapshotCount={0}
          currentValue={1000}
          currentPnl={120}
          currentPnlRate={0.12}
          currentCurrency="HKD"
        />
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<FieldsFixture />);
