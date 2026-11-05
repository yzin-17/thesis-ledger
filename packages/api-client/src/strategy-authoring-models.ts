import {
  authoringProviderListReadSchema,
  authoringModelRoutesReadSchema,
} from '@thesis-ledger/schemas';
import type { ParsedRequest } from './parsed-request.js';
const purposes = {
  analyze: 'strategy_authoring_analysis',
  generate: 'strategy_authoring_generation',
  modify: 'strategy_authoring_modification',
};
export async function authoringModels(request: ParsedRequest, signal?: AbortSignal) {
  const init = signal ? { signal } : undefined;
  const providers = await request('/ai/providers', authoringProviderListReadSchema, init);
  const rows = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      routes: await request(
        `/ai/providers/${encodeURIComponent(provider.name)}/readiness`,
        authoringModelRoutesReadSchema,
        init,
      ),
    })),
  );
  return rows.flatMap(({ provider, routes }) =>
    provider.models.map((model) => {
      const price = provider.modelPricing?.[model] ?? provider;
      const known =
        price.costPer1kInput !== undefined &&
        price.costPer1kOutput !== undefined &&
        Boolean(price.costCurrency);
      const available = Object.fromEntries(
        Object.entries(purposes).map(([kind, purpose]) => [
          kind,
          routes.some(
            (route) =>
              route.model === model &&
              route.contract.id === purpose &&
              route.liveValidation.status === 'passed' &&
              route.readiness.reasons.every((reason) => reason === 'budget_not_authorized'),
          ),
        ]),
      ) as Record<'analyze' | 'generate' | 'modify', boolean>;
      return {
        key: JSON.stringify([provider.name, model]),
        providerId: provider.name,
        model,
        available,
        costUnknown: !known,
        pricingLabel: known
          ? `每千 tokens 输入 ${price.costPer1kInput} / 输出 ${price.costPer1kOutput} ${price.costCurrency}（配置估算）`
          : '费用未知',
      };
    }),
  );
}
