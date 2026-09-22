import { useRef, useState, type FormEvent } from 'react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import {
  aiProviderDraftError,
  aiProviderDraftFromRecord,
  aiProviderInputFromDraft,
  aiProviderTestPricingState,
  aiProviderTestInputFromDraft,
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
import { useSaveProviderMutation, useTestProviderDraftMutation } from './providers.mutations.js';
import {
  newProviderDraft,
  providerCredentialForSave,
  providerDraftForType,
  type AiAuthMode,
  type AiProviderModelDetail,
  type ProviderDraft,
  type ProviderRecord,
  type ProviderTestEvidence,
  type ProviderTestState,
} from './providers.types.js';
import { createLatestRequestGate, createSingleFlightGate } from './ai-provider-editor-async.js';
import {
  cancelAiProviderTest,
  type AiProviderLifecycleOptions,
  type AiRoutingSettings,
} from './ai-provider.api.js';

const testSucceeded = (status: string | undefined) => status === 'healthy';

type ActiveAiTest = {
  name: string;
  requestId: string;
  controller: AbortController;
};

const newTestRequestId = () => {
  const requestId = globalThis.crypto?.randomUUID?.();
  if (!requestId) throw new Error('当前环境不支持可取消的测试请求');
  return requestId;
};

export const useAiProviderEditor = (routingSettings?: AiRoutingSettings) => {
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
  const [testFlight] = useState(createSingleFlightGate);
  const activeAiTestRef = useRef<ActiveAiTest | null>(null);
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

  const beginAiTest = (name: string): ActiveAiTest => {
    const active: ActiveAiTest = {
      name,
      requestId: newTestRequestId(),
      controller: new AbortController(),
    };
    activeAiTestRef.current = active;
    return active;
  };

  const finishAiTest = (active: ActiveAiTest) => {
    if (activeAiTestRef.current === active) activeAiTestRef.current = null;
  };

  const cancelTest = () => {
    if (saveMutation.isPending) {
      saveMutation.cancelSave();
      return;
    }
    const active = activeAiTestRef.current;
    if (!active) return;
    void cancelAiProviderTest(active.name, active.requestId).catch(() => undefined);
    active.controller.abort();
    activeAiTestRef.current = null;
    testRequestGate.invalidate();
    testFlight.end();
    setTestState('idle');
    setTestEvidence(null);
    setTestingProviderName((current) => (current === active.name ? null : current));
    toastManager.add({
      title: `${active.name} 测试已取消`,
      description: '外部结果未知，已知用量会保留，费用不会按零处理。',
      type: 'info',
      timeout: 3200,
    });
  };

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
      const nextDraft = providerDraftFromRecord(provider);
      setDraft(nextDraft);
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
    const apiKey = draft.authMode === 'api_key' ? draft.credentialsRef.trim() : '';
    const timeoutMs = Number(draft.timeoutMs);
    const requestSequence = modelRequestGate.begin();
    try {
      const result = await modelCatalogMutation.mutateAsync({
        ...(name ? { name } : {}),
        baseUrl,
        authMode: draft.authMode,
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

  const testDraft = async (
    model?: string,
    purpose?: ProviderDraft['executionRoutes'][number]['contractId'],
    mode?: ProviderDraft['executionRoutes'][number]['mode'],
  ) => {
    if (!testFlight.tryBegin()) return;
    if (draft.type !== 'ai') {
      try {
        await testOrdinaryDraft();
      } finally {
        testFlight.end();
      }
      return;
    }
    const testKind = model === undefined ? 'connection' : 'generation';
    const pricingState =
      model === undefined ? 'zero' : aiProviderTestPricingState(draft.modelPricing[model]);
    if (pricingState === 'paid') {
      const confirmed = await confirm({
        title: '授权生成测试费用？',
        description: '本次测试会向指定模型发起一次最小结构化生成请求，可能产生上游费用。',
        confirmLabel: '授权并测试',
      });
      if (!confirmed) {
        testFlight.end();
        return;
      }
    }
    const input = aiProviderTestInputFromDraft(
      draft,
      model,
      testKind,
      pricingState === 'paid' ? true : undefined,
      purpose,
      mode,
    );
    if (invalidDraft(input)) {
      testFlight.end();
      return;
    }
    const requestSequence = testRequestGate.begin();
    setTestState('testing');
    const active = beginAiTest(input.name);
    try {
      const result = await testDraftMutation.mutateAsync({
        input: { ...input, requestId: active.requestId },
        signal: active.controller.signal,
      });
      if (!testRequestGate.isCurrent(requestSequence)) return;
      setTestEvidence(
        result.testToken
          ? {
              token: result.testToken,
              ...(model === undefined ? {} : { model }),
              ...(draft.credentialsRef.trim()
                ? { credentialsRef: draft.credentialsRef.trim() }
                : {}),
            }
          : null,
      );
      if (testSucceeded(result.status)) {
        setTestState('success');
        toastManager.add({
          title: `${input.name} ${testKind === 'generation' ? '生成测试' : '连通性测试'}成功`,
          description:
            testKind === 'generation'
              ? `仅证明指定模型的最小生成请求可用。${result.message ? ` ${result.message}` : ''}`
              : `仅证明测试连接可用，不代表业务结构化生成已通过。${result.message ? ` ${result.message}` : ''}`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        setTestState('error');
        toastManager.add({
          title: `${input.name} ${testKind === 'generation' ? '生成测试' : '连通性测试'}失败`,
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
        title: `${input.name} ${testKind === 'generation' ? '生成测试' : '连通性测试'}失败`,
        description: error instanceof Error ? error.message : '连接测试失败。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      finishAiTest(active);
      testFlight.end();
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
    const reusableTestToken = testEvidence?.model ? undefined : testEvidence?.token;
    const input = aiProviderInputFromDraft(draft, reusableTestToken);
    if (invalidDraft(input)) return;
    if (takingOverEnvironmentName && draft.authMode === 'api_key' && !input.apiKey) {
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

  const testSaved = async (
    provider: ProviderRecord,
    model?: string,
    purpose?: ProviderDraft['executionRoutes'][number]['contractId'],
    mode?: ProviderDraft['executionRoutes'][number]['mode'],
  ) => {
    if (!testFlight.tryBegin()) return;
    const selectedModel = model ?? provider.models?.[0];
    let pricing: Parameters<typeof aiProviderTestPricingState>[0];
    if (provider.modelPricing === undefined) {
      pricing = {
        ...(provider.costPer1kInput === undefined
          ? {}
          : { costPer1kInput: provider.costPer1kInput }),
        ...(provider.costPer1kOutput === undefined
          ? {}
          : { costPer1kOutput: provider.costPer1kOutput }),
        ...(provider.costCurrency === undefined ? {} : { costCurrency: provider.costCurrency }),
      };
    } else if (selectedModel !== undefined) {
      pricing = provider.modelPricing[selectedModel];
    }
    const pricingState = aiProviderTestPricingState(pricing);
    if (pricingState === 'paid') {
      const confirmed = await confirm({
        title: '授权生成测试费用？',
        description: '本次测试会向指定模型发起一次最小结构化生成请求，可能产生上游费用。',
        confirmLabel: '授权并测试',
      });
      if (!confirmed) {
        testFlight.end();
        return;
      }
    }
    setTestingProviderName(provider.name);
    const requestSequence = testRequestGate.begin();
    const active = beginAiTest(provider.name);
    try {
      const result = await testSavedMutation.mutateAsync({
        name: provider.name,
        ...(model === undefined ? {} : { model }),
        ...(purpose === undefined ? {} : { purpose }),
        ...(mode === undefined ? {} : { mode }),
        ...(pricingState === 'paid' ? { budgetAuthorized: true } : {}),
        requestId: active.requestId,
        signal: active.controller.signal,
      });
      if (!testRequestGate.isCurrent(requestSequence)) return;
      if (testSucceeded(result.status)) {
        toastManager.add({
          title: `${provider.name} 生成测试成功`,
          type: 'success',
          timeout: 2800,
        });
      } else {
        toastManager.add({
          title: `${provider.name} 生成测试失败`,
          description: result.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      if (!testRequestGate.isCurrent(requestSequence)) return;
      toastManager.add({
        title: `${provider.name} 生成测试失败`,
        description: error instanceof Error ? error.message : '请检查服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      finishAiTest(active);
      setTestingProviderName((current) => (current === provider.name ? null : current));
      testFlight.end();
    }
  };

  const toggle = async (provider: ProviderRecord) => {
    if (provider.source === 'environment') return;
    const isResearchDefault = routingSettings?.researchDefault?.providerId === provider.name;
    let lifecycle: AiProviderLifecycleOptions = provider.updatedAt
      ? { expectedRevision: provider.updatedAt }
      : {};
    if (provider.enabled && isResearchDefault && routingSettings) {
      const confirmed = await confirm({
        title: `停用 ${provider.name} 并清除研究默认？`,
        description: '停用默认 Provider 会同时清除研究默认引用，两个变更会原子提交。',
        confirmLabel: '清除默认并停用',
        cancelLabel: '取消',
        variant: 'destructive',
      });
      if (!confirmed) return;
      lifecycle = {
        ...lifecycle,
        clearResearchDefault: true,
        expectedSettingsRevision: routingSettings.revision,
      };
    }
    setTestingProviderName(provider.name);
    try {
      await setEnabledMutation.mutateAsync({
        name: provider.name,
        enabled: !provider.enabled,
        ...lifecycle,
      });
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
      const lifecycle =
        routingSettings?.researchDefault?.providerId === provider.name
          ? {
              clearResearchDefault: true,
              expectedSettingsRevision: routingSettings.revision,
            }
          : undefined;
      const deleted = await requestAiProviderDeletion(
        provider,
        confirm,
        (name, expectedRevision) =>
          deleteMutation.mutateAsync({
            name,
            ...(expectedRevision ? { expectedRevision } : {}),
            ...(lifecycle ?? {}),
          }),
        lifecycle,
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
    cancelTest,
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
      onAuthModeChange: changeAuthMode,
    },
    testingProviderName,
    deletingProviderName,
  };
};
