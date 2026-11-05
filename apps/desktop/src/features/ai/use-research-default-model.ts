import { useEffect, useState } from 'react';
import { useUpdateAiRoutingSettingsMutation } from '../providers/ai-provider.mutations.js';
import { useAiRoutingSettingsQuery } from './ai.queries.js';

const candidateKey = (providerId: string, model: string) => `${providerId}\u0000${model}`;

export function useResearchDefaultModel(open: boolean) {
  const query = useAiRoutingSettingsQuery(open);
  const mutation = useUpdateAiRoutingSettingsMutation();
  const [draftKey, setDraftKey] = useState<string>();
  const settings = query.data;
  const currentKey = settings?.researchDefault
    ? candidateKey(settings.researchDefault.providerId, settings.researchDefault.model)
    : 'none';
  const selectedKey = draftKey ?? currentKey;
  const options = (settings?.candidates ?? []).map((candidate) => ({
    ...candidate,
    value: candidateKey(candidate.providerId, candidate.model),
    label: `${candidate.providerName} / ${candidate.model}`,
  }));
  const selected = options.find(({ value }) => value === selectedKey);
  const dirty = selectedKey !== currentKey;

  useEffect(() => {
    setDraftKey(undefined);
  }, [open, settings?.revision]);

  const choose = (key: string | null) => {
    if (mutation.isPending) return;
    mutation.reset();
    setDraftKey(key ?? 'none');
  };
  const save = () => {
    if (settings?.revision === undefined || mutation.isPending || !dirty) return;
    if (selectedKey !== 'none' && !selected) return;
    void mutation
      .mutateAsync({
        researchDefault: selected
          ? { providerId: selected.providerId, model: selected.model }
          : null,
        expectedRevision: settings.revision,
      })
      .catch(() => undefined);
  };
  const reload = () => {
    if (mutation.isPending) return;
    mutation.reset();
    void query.refetch();
  };

  return {
    query,
    options,
    selected,
    selectedKey,
    currentDefault: settings?.researchDefault,
    dirty,
    saving: mutation.isPending,
    error: mutation.error,
    ready:
      !query.isPending &&
      !query.isError &&
      Boolean(settings?.researchDefault) &&
      !dirty &&
      !mutation.isPending,
    choose,
    save,
    reload,
  };
}
