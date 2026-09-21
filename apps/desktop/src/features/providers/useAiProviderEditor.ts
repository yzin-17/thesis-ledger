import { useState, type FormEvent } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import {
  aiProviderDraftError,
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
  mergeSelectedModelReasoning,
  modelDetailsFromCatalog,
  modelsFromText,
  requestAiProviderDeletion,
} from './ai-provider.actions.js';
import {
  useDeleteAiProviderMutation,
  useFetchAiProviderModelsMutation,
  useSaveAiProviderMutation,
  useSetAiProviderEnabledMutation,
  useTestAiProviderDraftMutation,
  useTestSavedAiProviderMutation,
} from './ai-provider.mutations.js';
import {
  useSaveProviderMutation,
  useTestProviderDraftMutation,
} from './providers.mutations.js';
import {
  newProviderDraft,
  providerCredentialForSave,
  providerDraftForType,
  type AiProviderModelDetail,
  type ProviderDraft,
  type ProviderRecord,
  type ProviderTestEvidence,
  type ProviderTestState,
} from './providers.types.js';
import { createLatestRequestGate } from './ai-provider-editor-async.js';

const testSucceeded = (status: string | undefined) => status === 'healthy';

export const useAiProviderEditor = () => {
  const [draft, setDraft] = useState<ProviderDraft>(newProviderDraft);
  const [open, setOpen] = useState(false);
  const [editingProviderName, setEditingProviderName] = useState<string | null>(null);
  const [takingOverEnvironmentName, setTakingOverEnvironmentName] = useState<string | null>(null);
  const [credentialInputOpen, setCredentialInputOpen] = useState(true);
  const [testState, setTestState] = useState<ProviderTestState>('idle');
  const [testEvidence, setTestEvidence] = useState<ProviderTestEvidence | null>(null);
  const [testingProviderName, setTestingProviderName] = useState<string | null>(null);
  const [deletingProviderName, setDeletingProviderName] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelDetails, setModelDetails] = useState<AiProviderModelDetail[]>([]);
  const [modelRequestGate] = useState(createLatestRequestGate);
  const [testRequestGate] = useState(createLatestRequestGate);
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const saveMutation = useSaveAiProviderMutation();
  const testDraftMutation = useTestAiProviderDraftMutation();
  const testSavedMutation = useTestSavedAiProviderMutation();
  const saveProviderMutation = useSaveProviderMutation();
  const testProviderDraftMutation = useTestProviderDraftMutation();
  const setEnabledMutation = useSetAiProviderEnabledMutation();
  const deleteMutation = useDeleteAiProviderMutation();
  const modelCatalogMutation = useFetchAiProviderModelsMutation();

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
    setTakingOverEnvironmentName(null);
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

  const providerDraftFromRecord = (provider: ProviderRecord): ProviderDraft => {
    if (provider.type === 'ai') return aiProviderDraftFromRecord(provider);
    return {
      ...newProviderDraft(),
      name: provider.name,
      type: provider.type,
      capabilities: [...provider.capabilities],
      priority: provider.priority,
      enabled: provider.enabled,
    };
  };

  const openEditor = (provider?: ProviderRecord, initialDraft?: ProviderDraft) => {
    if (!provider) {
      setDraft(initialDraft ?? newProviderDraft());
      setEditingProviderName(null);
      setTakingOverEnvironmentName(null);
      setCredentialInputOpen(true);
    } else {
      setDraft(providerDraftFromRecord(provider));
      if (provider.source === 'environment') {
        setEditingProviderName(null);
        setTakingOverEnvironmentName(provider.name);
        setCredentialInputOpen(true);
      } else {
        setEditingProviderName(provider.name);
        setTakingOverEnvironmentName(null);
        setCredentialInputOpen(!provider.credentialConfigured);
      }
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

  const updateDraft = (updater: (current: ProviderDraft) => ProviderDraft) => {
    setDraft(updater);
    invalidateDraftResults();
  };

  const invalidDraft = (input: ReturnType<typeof aiProviderInputFromDraft>) => {
    const error = aiProviderDraftError(input);
    if (!error) return false;
    toastManager.add({
      title: 'AI Provider 配置不完整',
      description: error,
      type: 'error',
      timeout: 7000,
      priority: 'high',
    });
    return true;
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

  const fetchModels = async () => {
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) {
      toastManager.add({
        title: '无法获取模型目录',
        description: '请先填写 API Base URL。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    const name = draft.name.trim();
    const apiKey = draft.credentialsRef.trim();
    const timeoutMs = Number(draft.timeoutMs);
    const requestSequence = modelRequestGate.begin();
    try {
      const result = await modelCatalogMutation.mutateAsync({
        ...(name ? { name } : {}),
        baseUrl,
        upstreamFormat: draft.upstreamFormat,
        ...(apiKey ? { apiKey } : {}),
        ...(Number.isInteger(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
      });
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
        description: error instanceof Error ? error.message : '可继续手动填写模型 ID。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      if (modelRequestGate.isCurrent(requestSequence)) modelCatalogMutation.reset();
    }
  };

  const testOrdinaryDraft = async () => {
    const input = providerInputFromDraft();
    if (invalidOrdinaryDraft(input)) return;
    const requestSequence = testRequestGate.begin();
    setTestState('testing');
    try {
      const result = await testProviderDraftMutation.mutateAsync(input);
      if (!testRequestGate.isCurrent(requestSequence)) return;
      const credentialsRef = input.credentialsRef;
      setTestEvidence(
        result.testToken
          ? { token: result.testToken, ...(credentialsRef ? { credentialsRef } : {}) }
          : null,
      );
      if (testSucceeded(result.status)) {
        setTestState('success');
        toastManager.add({
          title: `${input.name} 连通性测试成功`,
          description: result.message,
          type: 'success',
          timeout: 2800,
        });
      } else {
        setTestState('error');
        toastManager.add({
          title: `${input.name} 连通性测试失败`,
          description: result.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      if (!testRequestGate.isCurrent(requestSequence)) return;
      setTestState('error');
      toastManager.add({
        title: `${input.name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '连接测试失败。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const testDraft = async () => {
    if (draft.type !== 'ai') {
      await testOrdinaryDraft();
      return;
    }
    const input = aiProviderInputFromDraft(draft);
    if (invalidDraft(input)) return;
    const requestSequence = testRequestGate.begin();
    setTestState('testing');
    try {
      const result = await testDraftMutation.mutateAsync(input);
      if (!testRequestGate.isCurrent(requestSequence)) return;
      setTestEvidence(
        result.testToken
          ? {
              token: result.testToken,
              ...(draft.credentialsRef.trim()
                ? { credentialsRef: draft.credentialsRef.trim() }
                : {}),
            }
          : null,
      );
      if (testSucceeded(result.status)) {
        setTestState('success');
        toastManager.add({
          title: `${input.name} 最小生成测试成功`,
          description: `仅证明连接与最小生成可用，不代表业务结构化生成已通过。${result.message ? ` ${result.message}` : ''}`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        setTestState('error');
        toastManager.add({
          title: `${input.name} 连通性测试失败`,
          description: result.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      if (!testRequestGate.isCurrent(requestSequence)) return;
      setTestState('error');
      toastManager.add({
        title: `${input.name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '连接测试失败。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveMutation.isPending || saveProviderMutation.isPending) return;
    if (draft.type !== 'ai') {
      const input = providerInputFromDraft();
      if (invalidOrdinaryDraft(input)) return;
      if (takingOverEnvironmentName && !input.credentialsRef) {
        toastManager.add({
          title: '接管部署配置需要凭证',
          description: '请填写目标类型的 API Key、Token 或 Webhook 后保存。',
          type: 'error',
          timeout: 7000,
          priority: 'high',
        });
        return;
      }
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
          description: error instanceof Error ? error.message : '请检查服务连接后重试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
      return;
    }
    const input = aiProviderInputFromDraft(draft, testEvidence?.token);
    if (invalidDraft(input)) return;
    if (takingOverEnvironmentName && !input.apiKey) {
      toastManager.add({
        title: '接管部署配置需要 API Key',
        description: '请填写新的 API Key 后保存。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
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
        description: error instanceof Error ? error.message : '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  const testSaved = async (provider: ProviderRecord) => {
    setTestingProviderName(provider.name);
    try {
      const result = await testSavedMutation.mutateAsync(provider.name);
      if (testSucceeded(result.status)) {
        toastManager.add({
          title: `${provider.name} 连通性测试成功`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        toastManager.add({
          title: `${provider.name} 连通性测试失败`,
          description: result.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      toastManager.add({
        title: `${provider.name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '请检查服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setTestingProviderName((current) => (current === provider.name ? null : current));
    }
  };

  const toggle = async (provider: ProviderRecord) => {
    if (provider.source === 'environment') return;
    setTestingProviderName(provider.name);
    try {
      await setEnabledMutation.mutateAsync({ name: provider.name, enabled: !provider.enabled });
      toastManager.add({
        title: `${provider.name} 已${provider.enabled ? '停用' : '启用'}`,
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      toastManager.add({
        title: `${provider.name} 启停失败`,
        description: error instanceof Error ? error.message : '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setTestingProviderName((current) => (current === provider.name ? null : current));
    }
  };

  const remove = async (provider: ProviderRecord) => {
    setDeletingProviderName(provider.name);
    try {
      const deleted = await requestAiProviderDeletion(provider, confirm, (name) =>
        deleteMutation.mutateAsync(name),
      );
      if (deleted)
        toastManager.add({ title: `${provider.name} 已删除`, type: 'success', timeout: 2800 });
    } catch (error) {
      toastManager.add({
        title: `${provider.name} 删除失败`,
        description: error instanceof Error ? error.message : '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setDeletingProviderName((current) => (current === provider.name ? null : current));
    }
  };

  return {
    close,
    openEditor,
    changeType,
    updateDraft,
    fetchModels,
    testDraft,
    saveDraft,
    testSaved,
    toggle,
    remove,
    editor: {
      open,
      editingProviderName,
      providerDraft: draft,
      credentialInputOpen,
      takingOverEnvironmentName,
      providerTestState: testState,
      savingProviderDraft: saveMutation.isPending || saveProviderMutation.isPending,
      availableModels,
      modelDetails,
      modelCatalogState: modelCatalogMutation.isPending ? ('loading' as const) : ('idle' as const),
      onOpenChange: (nextOpen: boolean) => (nextOpen ? setOpen(true) : close()),
      onResetTest: resetTest,
      onSetCredentialInputOpen: setCredentialInputOpen,
    },
    testingProviderName,
    deletingProviderName,
  };
};
