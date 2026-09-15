import type { QueryClient } from '@tanstack/react-query';
import { marketDataKeys } from './market-data.queries.js';
import { setMarketProviderEnabled } from './market-data.api.js';
import type { ProviderManifest } from './market-data.types.js';

export const providerEnabledMutationKey = [...marketDataKeys.providers(), 'enabled'] as const;
export type ProviderEnabledChange = { providerId: string; enabled: boolean };

const updateEnabled = (client: QueryClient, change: ProviderEnabledChange) =>
  client.setQueryData<ProviderManifest[]>(marketDataKeys.providers(), (providers) =>
    providers?.map((provider) =>
      provider.providerId === change.providerId
        ? { ...provider, enabled: change.enabled }
        : provider,
    ),
  );

export const providerEnabledMutationOptions = (client: QueryClient) => ({
  mutationKey: providerEnabledMutationKey,
  mutationFn: ({ providerId, enabled }: ProviderEnabledChange) =>
    setMarketProviderEnabled(providerId, enabled),
  onMutate: async (change: ProviderEnabledChange) => {
    await client.cancelQueries({ queryKey: marketDataKeys.providers() });
    const previous = client
      .getQueryData<ProviderManifest[]>(marketDataKeys.providers())
      ?.find((provider) => provider.providerId === change.providerId)?.enabled;
    updateEnabled(client, change);
    return { previous };
  },
  onSuccess: (result: ProviderEnabledChange) => updateEnabled(client, result),
  onError: (
    _error: unknown,
    change: ProviderEnabledChange,
    context: { previous: boolean | undefined } | undefined,
  ) => {
    if (context?.previous !== undefined)
      updateEnabled(client, { ...change, enabled: context.previous });
  },
  onSettled: async () => {
    if (client.isMutating({ mutationKey: providerEnabledMutationKey }) === 1) {
      await Promise.all([
        client.invalidateQueries({ queryKey: marketDataKeys.providers() }),
        client.invalidateQueries({ queryKey: marketDataKeys.policy() }),
      ]);
    }
  },
});
