import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import { AiProviderEditorFields } from '../src/features/providers/AiProviderEditorFields.js';
import {
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import type { ProviderRecord } from '../src/features/providers/providers.types.js';
import '../src/ui/styles.css';

const initial: ProviderRecord = {
  name: '请求参数本地验收',
  type: 'ai',
  enabled: false,
  priority: 100,
  capabilities: ['chat'],
  health: 'unknown',
  authMode: 'none',
  baseUrl: 'https://example.invalid/v1',
  models: ['controlled-model'],
  executionRouteConfigs: [
    {
      model: 'controlled-model',
      mode: 'json_mode',
      outputPolicy: 'manual',
      enabled: true,
      contract: { id: 'research', version: 'research-generation-v2' },
    },
  ],
  modelDefaults: { 'controlled-model': { mode: 'json_mode', outputPolicy: 'manual' } },
};
function Fixture() {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => aiProviderDraftFromRecord(initial));
  const [result, setResult] = useState('尚未保存');
  const [serialized, setSerialized] = useState('');
  const save = () => {
    try {
      const input = aiProviderInputFromDraft(draft);
      const next = {
        ...saved,
        modelDefaults: input.modelDefaults ?? {},
        executionRouteConfigs: input.executionRoutes ?? [],
      };
      setSaved(next);
      setDraft(aiProviderDraftFromRecord(next));
      setSerialized(JSON.stringify(input, null, 2));
      setResult('本地草稿已保存并重开');
    } catch (error) {
      setResult(error instanceof Error ? error.message : '草稿错误');
    }
  };
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">模型请求参数本地验收</h1>
      <p>此夹具只验证本地草稿；正式HTTP、Provider与业务验收独立执行。</p>
      <AiProviderEditorFields
        draft={draft}
        credentialInputOpen={false}
        onUpdateDraft={setDraft}
        onResetTest={() => undefined}
        onSetCredentialInputOpen={() => undefined}
        section="model"
      />
      <div className="flex gap-3">
        <Button onClick={save}>保存并重开草稿</Button>
        <Button
          variant="outline"
          onClick={() => {
            setDraft(aiProviderDraftFromRecord(saved));
            setResult('已取消未保存更改');
          }}
        >
          取消更改
        </Button>
      </div>
      <output aria-label="本地保存结果">{result}</output>
      <pre aria-label="本地保存输入" className="overflow-x-auto text-xs">
        {serialized}
      </pre>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
