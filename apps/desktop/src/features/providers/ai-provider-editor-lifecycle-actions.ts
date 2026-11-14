import { requestFailureMessage } from '../../shared/api/request-error.js';
import type { AiProviderEditorState } from './ai-provider-editor-state.js';
import { requestAiProviderDeletion } from './ai-provider.actions.js';
import { type AiProviderLifecycleOptions, type AiRoutingSettings } from './ai-provider.api.js';
import { type ProviderRecord } from './providers.types.js';
export function createAiProviderLifecycleActions(
  state: AiProviderEditorState,
  routingSettings: AiRoutingSettings | undefined,
) {
  const {
    confirm,
    setTestingProviderName,
    setEnabledMutation,
    toastManager,
    setDeletingProviderName,
    deleteMutation,
  } = state;
  const toggle = async (provider: ProviderRecord) => {
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
        description: requestFailureMessage(error, '请检查服务连接后重试。'),
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
        description: requestFailureMessage(error, '请检查服务连接后重试。'),
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setDeletingProviderName((current) => (current === provider.name ? null : current));
    }
  };
  return { toggle, remove };
}
