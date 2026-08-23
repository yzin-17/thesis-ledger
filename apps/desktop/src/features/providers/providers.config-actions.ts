import type { FormEvent } from 'react';

import { newProviderDraft } from './providers.types.js';
import type { ProviderRecord } from './providers.types.js';
import type { ProviderActionDependencies } from './providers.actions.js';

export const createProviderConfigHandlers = (dependencies: ProviderActionDependencies) => {
  const {
    providerDraft,
    providerTestEvidence,
    savingProviderDraft,
    setProviderDraft,
    setProviderSheetOpen,
    setEditingProviderName,
    setCredentialInputOpen,
    setSavingProviderName,
    setSavingProviderDraft,
    setProviderPriorityDrafts,
    toastManager,
    providerMutation,
    load,
    resetProviderTest,
  } = dependencies;

  const saveProvider = async (
    provider: ProviderRecord,
    enabled = provider.enabled,
    successTitle = `${provider.name} 配置已保存`,
  ) => {
    setSavingProviderName(provider.name);
    try {
      const savedResponse = await providerMutation.mutateAsync({
        name: provider.name,
        type: provider.type,
        enabled,
        priority: provider.priority,
        capabilities: provider.capabilities,
      });
      if (savedResponse.healthCheck) void load();
      setProviderPriorityDrafts((current) => {
        const next = { ...current };
        delete next[provider.name];
        return next;
      });
      toastManager.add({ title: successTitle, type: 'success', timeout: 2800 });
    } catch {
      toastManager.add({
        title: `${provider.name} 配置保存失败`,
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setSavingProviderName((current) => (current === provider.name ? null : current));
    }
  };

  const openProviderSheet = (provider?: ProviderRecord) => {
    if (provider) {
      setEditingProviderName(provider.name);
      setCredentialInputOpen(!provider.credentialConfigured);
      setProviderDraft({
        name: provider.name,
        type: provider.type,
        capabilities: [...provider.capabilities],
        credentialsRef: '',
        priority: provider.priority,
        enabled: provider.enabled,
      });
    } else {
      setEditingProviderName(null);
      setCredentialInputOpen(true);
      setProviderDraft(newProviderDraft());
    }
    resetProviderTest();
    setProviderSheetOpen(true);
  };

  const saveProviderDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProviderDraft) return;
    const name = providerDraft.name.trim();
    const capabilities = providerDraft.capabilities;
    const priority = Number(providerDraft.priority);
    if (!name || capabilities.length === 0 || !Number.isInteger(priority) || priority < 0) {
      toastManager.add({
        title: 'Provider 配置不完整',
        description: '请填写 Provider 名称、至少一项能力和非负整数优先级。',
        type: 'error',
        timeout: 7000,
        priority: 'high',
      });
      return;
    }
    const credentialsRef =
      providerTestEvidence?.credentialsRef ?? providerDraft.credentialsRef.trim();
    setSavingProviderDraft(true);
    try {
      await providerMutation.mutateAsync({
        name,
        type: providerDraft.type,
        enabled: providerDraft.enabled,
        priority,
        capabilities,
        ...(credentialsRef ? { credentialsRef } : {}),
        ...(providerTestEvidence ? { connectionTestToken: providerTestEvidence.token } : {}),
      });
    } catch {
      setSavingProviderDraft(false);
      toastManager.add({
        title: 'Provider 配置保存失败',
        description: '请检查服务连接后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
      return;
    }
    setProviderDraft((current) => ({ ...current, credentialsRef: '' }));
    setEditingProviderName(null);
    setProviderSheetOpen(false);
    setCredentialInputOpen(true);
    resetProviderTest();
    setSavingProviderDraft(false);
    toastManager.add({
      title: `${name} 配置已保存`,
      description: '页面不会回显凭证。',
      type: 'success',
      timeout: 2800,
    });
  };

  const closeProviderSheet = () => {
    setProviderSheetOpen(false);
    setEditingProviderName(null);
    setCredentialInputOpen(true);
    resetProviderTest();
    setProviderDraft((current) => ({ ...current, credentialsRef: '' }));
  };

  return { saveProvider, openProviderSheet, saveProviderDraft, closeProviderSheet };
};
