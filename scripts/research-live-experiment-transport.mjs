import { assertLiveExperimentRequest } from './research-live-experiment-target.mjs';
import { createOpenRouterFreeRequestPacer } from './research-live-experiment-openrouter.mjs';
import { captureCloudflareExperimentResponse } from './research-live-experiment-http.mjs';
import { observeExperimentResponse } from './research-live-experiment-response.mjs';

export function createLiveExperimentTransport({
  providerId,
  baseURL,
  isFree,
  onDispatch,
  save,
  httpClient = fetch,
}) {
  const sent = new Set(),
    responses = new Map(),
    identities = new Map(),
    settings = new Map();
  const wait = createOpenRouterFreeRequestPacer();
  return {
    forRequest: (localRequestId) => async (resource, options) => {
      assertLiveExperimentRequest(providerId, baseURL, resource, options?.method);
      if (sent.has(localRequestId)) throw new Error('同一SDK请求禁止重发');
      sent.add(localRequestId);
      if (isFree) await wait(options?.signal);
      let wire = null;
      try {
        if (typeof options?.body === 'string') wire = JSON.parse(options.body);
      } catch {}
      settings.set(localRequestId, {
        requestId: localRequestId,
        parsed: wire !== null,
        maxTokensPresent: wire !== null && Object.hasOwn(wire, 'max_tokens'),
        maxCompletionTokensPresent: wire !== null && Object.hasOwn(wire, 'max_completion_tokens'),
        maxTokens: Number.isSafeInteger(wire?.max_tokens) ? wire.max_tokens : null,
        maxCompletionTokens: Number.isSafeInteger(wire?.max_completion_tokens)
          ? wire.max_completion_tokens
          : null,
        reasoningEffort: ['low', 'medium', 'xhigh'].includes(wire?.reasoning_effort)
          ? wire.reasoning_effort
          : null,
      });
      save('wire-request-settings.json', [...settings.values()]);
      onDispatch();
      const response = await httpClient(resource, { ...options, redirect: 'error' });
      responses.set(localRequestId, await captureCloudflareExperimentResponse(response));
      save(
        'http-status.json',
        [...responses.entries()].map(([requestId, value]) => ({ requestId, ...value })),
      );
      if (providerId !== 'openrouter') return response;
      return observeExperimentResponse(response, (value) => {
        identities.set(localRequestId, value);
        save(
          'provider-response-ids.json',
          [...identities.entries()].map(([localRequestId, identity]) => ({
            localRequestId,
            ...identity,
          })),
        );
      });
    },
    providerGenerations: () =>
      [...identities.entries()].map(([localRequestId, value]) => ({ localRequestId, ...value })),
    identityForRequest: (requestId) => identities.get(requestId) ?? null,
  };
}
