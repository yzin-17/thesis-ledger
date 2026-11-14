import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { ProviderEditorSheet } from '../src/features/providers/ProviderEditorSheet';
import { newProviderDraft, newAiProviderDraft } from '../src/features/providers/providers.types';
import { AiProviderEditorFields } from '../src/features/providers/AiProviderEditorFields';
import { StrategyOptimizationModelSelector } from '../src/features/strategy/StrategyOptimizationModelSelector';
import type { OptimizationReasoningEffort } from '@thesis-ledger/schemas';
import { RiskNotificationProviderPicker } from '../src/features/risk/RiskNotificationProviderPicker';
import { RuleSourceMonitorSettings } from '../src/features/market-data/RuleSourceMonitorSettings';
import { useRuleSourceMonitor } from '../src/features/market-data/useRuleSourceMonitor';
import { ArenaModelSelector } from '../src/features/model-arena/ArenaModelSelector';
import '../src/ui/styles.css';

function CapabilityCase() {
  const [draft, setDraft] = useState(() => ({ ...newProviderDraft(), name: '受控通知', credentialsRef: 'fixture-placeholder' }));
  const [saved, setSaved] = useState('');
  return <><output data-testid="saved-capabilities">{saved}</output>
    <ProviderEditorSheet open onOpenChange={() => {}} editingProviderName={null} providerDraft={draft}
      credentialInputOpen={false} providerTestState="idle" savingProviderDraft={false}
      onUpdateDraft={setDraft} onResetTest={() => {}} onSetCredentialInputOpen={() => {}}
      onAuthModeChange={(authMode) => setDraft((value) => ({ ...value, authMode }))}
      onTypeChange={(type) => setDraft((value) => ({ ...value, type }))}
      onClose={() => {}} onTest={() => {}}
      onSave={(event) => { event.preventDefault(); setSaved(JSON.stringify(draft.capabilities)); }} />
  </>;
}
function MonitorCase() {
  const monitor = useRuleSourceMonitor();
  return <RuleSourceMonitorSettings monitor={monitor} />;
}
function ArenaCase() {
  const [models, setModels] = useState<{ providerId: string; model: string }[]>([]);
  return <><ArenaModelSelector choices={[{ providerId: '来源甲', model: '相同模型' }, { providerId: '来源乙', model: '相同模型' }]}
    value={models} onChange={setModels} /><output data-testid="bindings">{JSON.stringify(models)}</output></>;
}
function Fixture() {
  const scenario = new URLSearchParams(location.search).get('case');
  if (scenario === 'capabilities') return <CapabilityCase />;
  if (scenario === 'risk') return <RiskNotificationProviderPicker />;
  if (scenario === 'monitor') return <MonitorCase />;
  if (scenario === 'provider-models') return <ProviderModelsCase />;
  if (scenario === 'experiment-models') return <ExperimentModelsCase />;
  return <ArenaCase />;
}
function ProviderModelsCase() {
  const [draft, setDraft] = useState(newAiProviderDraft);
  return <><AiProviderEditorFields draft={draft} section="model" credentialInputOpen={false}
    onUpdateDraft={setDraft} onResetTest={() => {}} onSetCredentialInputOpen={() => {}}
    availableModels={['alpha-model', 'beta-model']} />
    <output data-testid="models">{draft.modelsText}</output></>;
}
function ExperimentModelsCase() {
  const [models, setModels] = useState<string[]>([]);
  const [efforts, setEfforts] = useState<Record<string, OptimizationReasoningEffort | undefined>>({});
  return <><StrategyOptimizationModelSelector
    routes={['a', 'b', 'c', 'd'].map((model) => ({ provider: '来源', model, costStatus: 'unknown' }))}
    selectedModels={models} onSelectedModelsChange={setModels} reasoningEfforts={efforts}
    onReasoningEffortsChange={setEfforts} /><output data-testid="models">{JSON.stringify(models)}</output></>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<MemoryRouter><ConfirmDialogProvider>
  <QueryClientProvider client={client}><main className="mx-auto flex min-w-0 max-w-5xl flex-col gap-group p-4"><Fixture /></main></QueryClientProvider>
</ConfirmDialogProvider></MemoryRouter>);
