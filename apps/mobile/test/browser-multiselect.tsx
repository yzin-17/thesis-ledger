import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';
import { Page, Action, Choices } from '../src/components/MobilePrimitives';
import { AiProviderFields } from '../src/features/ai-providers/AiProviderFields';
import { aiProviderDraft, buildAiProviderInput } from '../src/features/ai-providers/ai-provider-draft';
import { OptimizationModelFields } from '../src/features/optimization-setup/OptimizationModelFields';
import { ArenaModelSelector } from '../src/features/model-arena/ArenaModelSelector';

function ProviderCase() {
  const [draft, setDraft] = useState(() => ({ ...aiProviderDraft(), name: 'sample', baseUrl: 'https://models.example/v1', authMode: 'none' as const, models: 'model-a' }));
  const [payload, setPayload] = useState('');
  return <Page title="模型配置验收"><AiProviderFields draft={draft}
    change={(patch) => setDraft((value) => ({ ...value, ...patch }))} editing={false} disabled={false}
    availableModels={['model-a', 'model-b']} />
    <Action label="预览提交内容" onPress={() => setPayload(JSON.stringify(buildAiProviderInput(draft, '')))} />
    <Text testID="payload">{payload}</Text>
  </Page>;
}
function ModelCase() {
  const [models, setModels] = useState<string[]>([]), [efforts, setEfforts] = useState<Record<string, string>>({});
  const [ack, setAck] = useState('no');
  return <Page title="实验模型验收"><OptimizationModelFields
    providers={['a', 'b', 'c', 'd'].map((model) => ({ provider: '模型来源', model, costStatus: 'unknown' as const,
      reasoning: { supportedEfforts: ['high', 'low'] } }))}
    models={models} onModelsChange={(value) => { setModels(value); setAck('no'); }}
    efforts={efforts} onEffortsChange={setEfforts} disabled={false} />
    <Choices label="实验未知费用确认" value={ack} onChange={setAck}
      options={[{ value: 'no', label: '尚未确认' }, { value: 'yes', label: '接受所选模型的未知费用' }]} />
    <Text testID="payload">{JSON.stringify({ models, efforts, ack })}</Text>
  </Page>;
}
function ArenaCase() {
  const [models, setModels] = useState<{ providerId: string; model: string }[]>([]);
  return <Page title="参赛模型验收"><ArenaModelSelector
    choices={[{ providerId: '来源甲', model: '相同模型' }, { providerId: '来源乙', model: '相同模型' }]}
    value={models} onChange={setModels} /><Text testID="payload">{JSON.stringify(models)}</Text></Page>;
}
const scenario = new URLSearchParams(location.search).get('case');
let content = <ProviderCase />;
if (scenario === 'optimization') content = <ModelCase />;
else if (scenario === 'arena') content = <ArenaCase />;
createRoot(document.getElementById('root')!).render(<div style={{ display: 'flex', height: '100dvh', minWidth: 0 }}>{content}</div>);
