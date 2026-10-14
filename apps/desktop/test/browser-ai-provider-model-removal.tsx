import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import { AiProviderEditorFields } from '../src/features/providers/AiProviderEditorFields.js';
import {
  aiProviderDraftError,
  aiProviderInputFromDraft,
} from '../src/features/providers/ai-provider.actions.js';
import { newAiProviderExecutionRouteDraft } from '../src/features/providers/ai-provider-execution.js';
import { newAiProviderDraft } from '../src/features/providers/providers.types.js';
import '../src/ui/styles.css';

function Fixture() {
  const [draft, setDraft] = useState(() => ({
    ...newAiProviderDraft(),
    name: '模型删除验收',
    baseUrl: 'https://example.invalid/v1',
    modelsText: 'openrouter/free\nremoved-model',
    executionRoutes: ['openrouter/free', 'removed-model'].map(newAiProviderExecutionRouteDraft),
    modelPricing: Object.fromEntries(
      ['openrouter/free', 'removed-model'].map((model) => [
        model,
        { costPer1kInput: '0', costPer1kOutput: '0', costCurrency: 'USD' },
      ]),
    ),
  }));
  const [result, setResult] = useState('尚未校验');
  const input = aiProviderInputFromDraft(draft);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Provider 模型删除交互验收</h1>
      <p>此页面仅校验本地草稿，不发送模型测试或保存请求。</p>
      <AiProviderEditorFields
        draft={draft}
        onUpdateDraft={setDraft}
        credentialInputOpen={false}
        takingOverEnvironmentName={null}
        onResetTest={() => undefined}
        onSetCredentialInputOpen={() => undefined}
        availableModels={['openrouter/free', 'removed-model']}
        section="model"
      />
      <Button onClick={() => setResult(aiProviderDraftError(input) ?? '保存输入校验通过')}>
        校验保存输入
      </Button>
      <output aria-label="校验结果">{result}</output>
      <pre aria-label="保存输入" className="overflow-x-auto text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
