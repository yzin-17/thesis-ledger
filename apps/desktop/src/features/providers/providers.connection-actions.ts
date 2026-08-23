import type { ProviderActionDependencies } from './providers.actions.js';

export const createProviderConnectionHandlers = (dependencies: ProviderActionDependencies) => {
  const {
    providerDraft,
    credentialInputOpen,
    setProviderTestState,
    setProviderTestEvidence,
    setTestingProviderName,
    toastManager,
    testProviderMutation,
    testProviderDraftMutation,
    load,
  } = dependencies;

  const test = async (name: string) => {
    setTestingProviderName(name);
    try {
      const result = await testProviderMutation.mutateAsync(name);
      if (result.status !== 'healthy') {
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result.message ?? 'Provider 返回了错误响应。',
          type: 'error',
          timeout: 0,
          priority: 'high',
          actionProps: { type: 'button', children: '重新测试', onClick: () => void test(name) },
        });
        return;
      }
      if (result.healthCheck) void load();
      toastManager.add({ title: `${name} 连通性测试成功`, type: 'success', timeout: 2800 });
    } catch (error) {
      toastManager.add({
        title: `${name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '请检查服务连接。',
        type: 'error',
        timeout: 0,
        priority: 'high',
        actionProps: { type: 'button', children: '重新测试', onClick: () => void test(name) },
      });
    } finally {
      setTestingProviderName((current) => (current === name ? null : current));
    }
  };

  const testProviderDraft = async () => {
    const name = providerDraft.name.trim();
    const capabilities = providerDraft.capabilities;
    const priority = Number(providerDraft.priority);
    if (!name || capabilities.length === 0 || !Number.isInteger(priority) || priority < 0) {
      setProviderTestState('error');
      toastManager.add({
        title: '无法测试 Provider 连接',
        description: '请先填写 Provider 名称、至少一项能力和非负整数优先级。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    setProviderTestState('testing');
    setProviderTestEvidence(null);
    const credentialsRef = credentialInputOpen ? providerDraft.credentialsRef.trim() : undefined;
    try {
      const result = await testProviderDraftMutation.mutateAsync({
        name,
        type: providerDraft.type,
        enabled: providerDraft.enabled,
        priority,
        capabilities,
        ...(credentialsRef ? { credentialsRef } : {}),
      });
      setProviderTestEvidence(
        result.testToken
          ? { token: result.testToken, ...(credentialsRef ? { credentialsRef } : {}) }
          : null,
      );
      if (result.status === 'healthy') {
        setProviderTestState('success');
        toastManager.add({
          title: `${name} 连通性测试成功`,
          description: result.message,
          type: 'success',
          timeout: 2800,
        });
      } else if (['unconfigured', 'untested', 'disabled'].includes(result.status ?? '')) {
        setProviderTestState('warning');
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result.message ?? '当前配置尚未完成连接测试。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      } else {
        setProviderTestState('error');
        toastManager.add({
          title: `${name} 连通性测试失败`,
          description: result.message ?? '连接异常。',
          type: 'error',
          timeout: 0,
          priority: 'high',
        });
      }
    } catch (error) {
      setProviderTestState('error');
      toastManager.add({
        title: `${name} 连通性测试失败`,
        description: error instanceof Error ? error.message : '连接测试失败。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    }
  };

  return { test, testProviderDraft };
};
