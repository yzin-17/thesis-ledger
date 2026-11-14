import { type FormEvent } from 'react';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { validatedAiProviderInput } from './ai-provider-draft-validation.js';
import type { AiProviderEditorState } from './ai-provider-editor-state.js';
import {
  modelCatalogInputError,
  modelCatalogRequestFromDraft,
} from './ai-provider-model-catalog.js';
import {
  aiProviderInputFromDraft,
  mergeSelectedModelReasoning,
  modelDetailsFromCatalog,
  modelsFromText,
  providerDraftFromRecord,
} from './ai-provider.actions.js';
import {
  newProviderDraft,
  providerCredentialForSave,
  providerDraftForType,
  type AiAuthMode,
  type ProviderDraft,
  type ProviderRecord,
} from './providers.types.js';
export function createAiProviderEditorDraftActions(state: AiProviderEditorState) {
  const {
    testRequestGate,
    setTestState,
    setTestEvidence,
    modelRequestGate,
    setOpen,
    setEditingProviderName,
    setCredentialInputOpen,
    setDraft,
    setAvailableModels,
    setModelDetails,
    saveMutation,
    saveProviderMutation,
    testState,
    draft,
    credentialInputOpen,
    confirm,
    testEvidence,
    toastManager,
  } = state;
  const resetTest = () => {
    testRequestGate.invalidate();
    setTestState('idle');
    setTestEvidence(null);
  };
  const invalidateDraftResults = () => {
    modelRequestGate.invalidate();
    resetTest();
  };
  const resetEditor = () => {
    setOpen(false);
    setEditingProviderName(null);
    setCredentialInputOpen(true);
    setDraft(newProviderDraft());
    setAvailableModels([]);
    setModelDetails([]);
    invalidateDraftResults();
  };
  const close = () => {
    if (saveMutation.isPending || saveProviderMutation.isPending || testState === 'testing') return;
    resetEditor();
  };
  const openEditor = (provider?: ProviderRecord, initialDraft?: ProviderDraft) => {
    if (!provider) {
      setDraft(initialDraft ?? newProviderDraft());
      setEditingProviderName(null);
      setCredentialInputOpen(true);
    } else {
      const nextDraft = providerDraftFromRecord(provider);
      setDraft(nextDraft);
      setEditingProviderName(provider.name);
      setCredentialInputOpen(!provider.credentialConfigured);
    }
    invalidateDraftResults();
    setAvailableModels([]);
    setModelDetails([]);
    setOpen(true);
  };
  const changeType = (type: string) => {
    if (type === draft.type) return;
    setDraft((current) => providerDraftForType(type, current));
    setCredentialInputOpen(true);
    invalidateDraftResults();
    setAvailableModels([]);
    setModelDetails([]);
  };
  const changeAuthMode = async (authMode: AiAuthMode) => {
    if (authMode === draft.authMode) return;
    const hasExistingCredential = !credentialInputOpen || Boolean(draft.credentialsRef.trim());
    if (authMode === 'none' && hasExistingCredential) {
      const confirmed = await confirm({
        title: '切换为无需认证？',
        description: '保存后会清除已保存的 API Key，并且请求不会再发送认证信息。',
        confirmLabel: '清除并切换',
        variant: 'destructive',
      });
      if (!confirmed) return;
    }
    setDraft((current) => ({
      ...current,
      authMode,
      credentialsRef: '',
    }));
    setCredentialInputOpen(authMode === 'api_key');
    invalidateDraftResults();
  };
  const updateDraft = (updater: (current: ProviderDraft) => ProviderDraft) => {
    setDraft(updater);
    invalidateDraftResults();
  };
  const providerInputFromDraft = () => {
    const credentialsRef = credentialInputOpen
      ? providerCredentialForSave(draft.credentialsRef, testEvidence)
      : testEvidence?.credentialsRef;
    return {
      name: draft.name.trim(),
      type: draft.type,
      enabled: draft.enabled,
      priority: Number(draft.priority),
      capabilities: draft.capabilities,
      ...(credentialsRef ? { credentialsRef } : {}),
      ...(testEvidence ? { connectionTestToken: testEvidence.token } : {}),
    };
  };
  const ordinaryProviderDraftError = (input: ReturnType<typeof providerInputFromDraft>) => {
    if (!input.name) return '请填写 Provider 名称。';
    if (input.capabilities.length === 0) return '请至少选择一项 Provider 能力。';
    if (!Number.isInteger(input.priority) || input.priority < 0)
      return 'Provider 优先级必须是非负整数。';
    return null;
  };
  const invalidOrdinaryDraft = (input: ReturnType<typeof providerInputFromDraft>) => {
    const error = ordinaryProviderDraftError(input);
    if (!error) return false;
    toastManager.add({
      title: 'Provider 配置不完整',
      description: error,
      type: 'error',
      timeout: 7000,
      priority: 'high',
    });
    return true;
  };
  return {
    resetTest,
    invalidateDraftResults,
    resetEditor,
    close,
    openEditor,
    changeType,
    changeAuthMode,
    updateDraft,
    providerInputFromDraft,
    ordinaryProviderDraftError,
    invalidOrdinaryDraft,
  };
}

export function createAiProviderCatalogActions(state: AiProviderEditorState) {
  const {
    draft,
    toastManager,
    modelRequestGate,
    modelCatalogMutation,
    setAvailableModels,
    setModelDetails,
    setDraft,
  } = state;
  const fetchModels = async () => {
    const input = modelCatalogRequestFromDraft(draft);
    const catalogError = modelCatalogInputError({ ...input, authMode: draft.authMode });
    if (catalogError) {
      toastManager.add({
        title: '无法获取模型目录',
        description: catalogError,
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    const requestSequence = modelRequestGate.begin();
    try {
      const result = await modelCatalogMutation.mutateAsync(input);
      if (!modelRequestGate.isCurrent(requestSequence)) return;
      const nextModelDetails = modelDetailsFromCatalog(result.modelDetails);
      setAvailableModels(result.models);
      setModelDetails(nextModelDetails);
      setDraft((current) => {
        const selectedModels = modelsFromText(current.modelsText);
        return {
          ...current,
          modelReasoning: mergeSelectedModelReasoning(
            selectedModels,
            current.modelReasoning,
            nextModelDetails,
          ),
        };
      });
      toastManager.add({
        title: `已获取 ${result.models.length} 个模型`,
        description: '选择模型后再保存 Provider。',
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      if (!modelRequestGate.isCurrent(requestSequence)) return;
      toastManager.add({
        title: '模型目录获取失败',
        description: `${requestFailureMessage(error, '目录请求失败。')} 请在连接配置中检查模型目录规则，或手动填写模型 ID。`,
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      if (modelRequestGate.isCurrent(requestSequence)) modelCatalogMutation.reset();
    }
  };
  return { fetchModels };
}

export function createAiProviderSaveActions(
  state: AiProviderEditorState,
  draftActions: Pick<
    ReturnType<typeof createAiProviderEditorDraftActions>,
    'providerInputFromDraft' | 'invalidOrdinaryDraft' | 'resetEditor'
  >,
) {
  const { saveMutation, saveProviderMutation, draft, toastManager, testEvidence } = state;
  const { providerInputFromDraft, invalidOrdinaryDraft, resetEditor } = draftActions;
  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveMutation.isPending || saveProviderMutation.isPending) return;
    if (draft.type !== 'ai') {
      const input = providerInputFromDraft();
      if (invalidOrdinaryDraft(input)) return;
      try {
        await saveProviderMutation.mutateAsync(input);
        toastManager.add({
          title: `${input.name} 配置已保存`,
          description: '页面不会回显凭证。',
          type: 'success',
          timeout: 2800,
        });
        resetEditor();
      } catch (error) {
        toastManager.add({
          title: 'Provider 配置保存失败',
          description: requestFailureMessage(error),
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
      return;
    }
    const reusableTestToken = testEvidence?.model ? undefined : testEvidence?.token;
    const input = validatedAiProviderInput(
      () => aiProviderInputFromDraft(draft, reusableTestToken),
      toastManager,
    );
    if (!input) return;
    try {
      await saveMutation.mutateAsync(input);
      toastManager.add({
        title: `${input.name} 配置已保存`,
        description: '页面不会回显 API Key。',
        type: 'success',
        timeout: 2800,
      });
      resetEditor();
    } catch (error) {
      toastManager.add({
        title: 'AI Provider 配置保存失败',
        description: requestFailureMessage(error),
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };
  return { saveDraft };
}
