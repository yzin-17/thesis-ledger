import type { ProviderTestEvidence } from './providers.types.js';
import { createClientRequestId } from '../../lib/client-request-id';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { validatedAiProviderInput } from './ai-provider-draft-validation.js';
import type { createAiProviderEditorDraftActions } from './ai-provider-editor-draft-actions.js';
import type { ActiveAiTest, AiProviderEditorState } from './ai-provider-editor-state.js';
import { aiProviderTestInputFromDraft, aiProviderTestPricingState } from './ai-provider.actions.js';
import { cancelAiProviderTest } from './ai-provider.api.js';
import { type ProviderDraft, type ProviderRecord } from './providers.types.js';
const testSucceeded = (status: string | undefined) => status === 'healthy';
const newTestRequestId = createClientRequestId;
export function createAiProviderTestLifecycle(state: AiProviderEditorState) {
  const {
    activeAiTestRef,
    saveMutation,
    testRequestGate,
    testFlight,
    setTestState,
    setTestEvidence,
    setTestingProviderName,
    toastManager,
  } = state;
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
  return { beginAiTest, finishAiTest, cancelTest };
}

export function createOrdinaryProviderTest(
  state: AiProviderEditorState,
  draft: Pick<
    ReturnType<typeof createAiProviderEditorDraftActions>,
    'providerInputFromDraft' | 'invalidOrdinaryDraft'
  >,
) {
  const {
    testRequestGate,
    setTestState,
    testProviderDraftMutation,
    setTestEvidence,
    toastManager,
  } = state;
  const { providerInputFromDraft, invalidOrdinaryDraft } = draft;
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
        description: requestFailureMessage(error, '连接测试失败。'),
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };
  return { testOrdinaryDraft };
}

export function createAiProviderDraftTest(
  state: AiProviderEditorState,
  ordinary: Pick<ReturnType<typeof createOrdinaryProviderTest>, 'testOrdinaryDraft'>,
  active: Pick<ReturnType<typeof createAiProviderTestLifecycle>, 'beginAiTest' | 'finishAiTest'>,
) {
  const {
    testFlight,
    draft,
    confirm,
    toastManager,
    testRequestGate,
    setTestState,
    testDraftMutation,
    setTestEvidence,
  } = state;
  const { testOrdinaryDraft } = ordinary;
  const { beginAiTest, finishAiTest } = active;
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
    const input = validatedAiProviderInput(
      () =>
        aiProviderTestInputFromDraft(
          draft,
          model,
          testKind,
          pricingState === 'paid' ? true : undefined,
          purpose,
          mode,
        ),
      toastManager,
    );
    if (!input) {
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
      setTestEvidence(draftTestEvidence(result.testToken, model, draft.credentialsRef));
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
        description: requestFailureMessage(error, '连接测试失败。'),
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      finishAiTest(active);
      testFlight.end();
    }
  };
  return { testDraft };
}

export function createAiProviderSavedTest(
  state: AiProviderEditorState,
  active: Pick<ReturnType<typeof createAiProviderTestLifecycle>, 'beginAiTest' | 'finishAiTest'>,
) {
  const {
    testFlight,
    confirm,
    setTestingProviderName,
    testRequestGate,
    testSavedMutation,
    toastManager,
  } = state;
  const { beginAiTest, finishAiTest } = active;
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
        description: requestFailureMessage(error, '请检查服务连接。'),
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
  return { testSaved };
}

function draftTestEvidence(
  token: string | undefined,
  model: string | undefined,
  credentialsRef: string,
): ProviderTestEvidence | null {
  return token
    ? {
        token: token,
        ...(model === undefined ? {} : { model }),
        ...(credentialsRef.trim() ? { credentialsRef: credentialsRef.trim() } : {}),
      }
    : null;
}
