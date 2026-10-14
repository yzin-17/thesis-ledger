import {
  mergeSelectedModelReasoning,
  modelsFromText,
  modelsToText,
} from './ai-provider.actions.js';
import type { AiProviderModelDetail, ProviderDraft } from './providers.types.js';

export const withAiProviderModels = (
  draft: ProviderDraft,
  models: string[],
  modelDetails: AiProviderModelDetail[] = [],
): ProviderDraft => {
  const modelsText = modelsToText(models);
  const selectedModels = modelsFromText(modelsText);
  const selectedModelSet = new Set(selectedModels);
  return {
    ...draft,
    modelsText,
    executionRoutes: draft.executionRoutes.filter((route) => selectedModelSet.has(route.model)),
    modelDefaults: Object.fromEntries(
      Object.entries(draft.modelDefaults).filter(([model]) => selectedModelSet.has(model)),
    ),
    modelPricing: Object.fromEntries(
      Object.entries(draft.modelPricing).filter(([model]) => selectedModelSet.has(model)),
    ),
    modelReasoning: mergeSelectedModelReasoning(selectedModels, draft.modelReasoning, modelDetails),
  };
};
