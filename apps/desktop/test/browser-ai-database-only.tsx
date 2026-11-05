import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '../src/components/ui/button.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ProviderTable } from '../src/features/providers/ProviderSettingsSections.js';
import { ProviderEditorSheet } from '../src/features/providers/ProviderEditorSheet.js';
import { useAiProviderEditor } from '../src/features/providers/useAiProviderEditor.js';
import {
  newAiProviderDraft,
  type ProviderRecord,
} from '../src/features/providers/providers.types.js';
import '../src/ui/styles.css';

const sample: ProviderRecord = {
  name: '本地验收样例',
  type: 'ai',
  source: 'database',
  enabled: false,
  priority: 10,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: true,
  baseUrl: 'https://example.invalid/v1',
  models: ['example-model'],
  authMode: 'api_key',
  updatedAt: '2026-10-19T00:00:00.000Z',
};

function Fixture() {
  const [showSample, setShowSample] = useState(false);
  const editor = useAiProviderEditor();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">AI 服务统一配置交互验收</h1>
      <p>仅检查空态、新增、编辑和关闭；不保存配置或发起模型请求。</p>
      <Button onClick={() => setShowSample((current) => !current)}>
        {showSample ? '查看空态' : '加载数据库样例'}
      </Button>
      <ProviderTable
        loadState="ready"
        providers={showSample ? [sample] : []}
        priorityDrafts={{}}
        testingProviderName={null}
        savingProviderName={null}
        deletingProviderName={null}
        onPriorityChange={() => undefined}
        onPrioritySave={() => undefined}
        onEdit={editor.openEditor}
        onTest={() => undefined}
        onToggle={() => undefined}
        onDelete={() => undefined}
        onCreate={() => editor.openEditor(undefined, newAiProviderDraft())}
      />
      <ProviderEditorSheet
        {...editor.editor}
        onUpdateDraft={editor.updateDraft}
        onTypeChange={editor.changeType}
        onClose={editor.close}
        onTest={() => undefined}
        onSave={(event) => event.preventDefault()}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <ToastProvider>
      <ConfirmDialogProvider>
        <Fixture />
      </ConfirmDialogProvider>
    </ToastProvider>
  </QueryClientProvider>,
);
