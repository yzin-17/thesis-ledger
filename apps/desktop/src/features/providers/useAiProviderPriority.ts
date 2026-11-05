import { useRef, useState } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { aiProviderDraftFromRecord, aiProviderInputFromDraft } from './ai-provider.actions.js';
import { useSaveAiProviderMutation } from './ai-provider.mutations.js';
import type { ProviderRecord } from './providers.types.js';

export function useAiProviderPriority(onSaved: (name: string) => void) {
  const mutation = useSaveAiProviderMutation();
  const toastManager = useToastManager();
  const inFlight = useRef(false);
  const [savingProviderName, setSavingProviderName] = useState<string | null>(null);

  const save = async (provider: ProviderRecord) => {
    if (inFlight.current || !Number.isInteger(provider.priority) || provider.priority < 0) return;
    inFlight.current = true;
    setSavingProviderName(provider.name);
    try {
      await mutation.mutateAsync(aiProviderInputFromDraft(aiProviderDraftFromRecord(provider)));
      onSaved(provider.name);
      toastManager.add({
        title: `${provider.name} 配置已保存`,
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      toastManager.add({
        title: `${provider.name} 配置保存失败`,
        description: requestFailureMessage(error),
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      inFlight.current = false;
      setSavingProviderName(null);
    }
  };

  return { save, savingProviderName };
}
