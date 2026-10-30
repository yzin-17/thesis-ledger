import { aiCostFactsSchema, type AiCostFacts, type AiUsageFacts } from '@thesis-ledger/schemas';
import { AiSdkGenerationError, type AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { testPricingForModel } from './ai-provider-test-pricing.js';

export type AiProviderTestFacts = {
  actualModel: string | null;
  usage: AiUsageFacts;
  cost: AiCostFacts;
};

const unknownUsage = (): AiUsageFacts => ({
  status: 'unknown',
  inputTokens: null,
  outputTokens: null,
});
const unknownCost = (source: string | null = null): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source,
  pricingVersion: null,
});
const decimalCost = (value: number) => value.toFixed(8).replace(/\.?0+$/u, '') || '0';

export function aiProviderTestSuccessFacts(
  input: Parameters<typeof testPricingForModel>[0],
  model: string,
  result: Pick<
    AiSdkGenerationResult<unknown>,
    'usage' | 'providerCost' | 'providerCostCurrency' | 'actualModel'
  >,
): AiProviderTestFacts {
  const actualModel = result.actualModel ?? null;
  const usage = result.usage ?? unknownUsage();
  const pricing = testPricingForModel(input, model);
  const providerCurrency = result.providerCostCurrency?.trim().toUpperCase();
  if (typeof result.providerCost === 'string' && /^[A-Z]{3}$/u.test(providerCurrency ?? '')) {
    const reported = aiCostFactsSchema.safeParse({
      status: 'known',
      amount: result.providerCost,
      currency: providerCurrency,
      source: 'provider_reported',
      pricingVersion: pricing.pricingVersion ?? null,
    });
    if (reported.success) return { actualModel, usage, cost: reported.data };
  }
  const currency = pricing.costCurrency?.trim().toUpperCase();
  if (
    usage.inputTokens === null ||
    usage.outputTokens === null ||
    pricing.costPer1kInput === undefined ||
    pricing.costPer1kOutput === undefined ||
    !/^[A-Z]{3}$/u.test(currency ?? '')
  )
    return { actualModel, usage, cost: unknownCost() };
  const estimated = aiCostFactsSchema.safeParse({
    status: 'estimated',
    amount: decimalCost(
      (usage.inputTokens * pricing.costPer1kInput + usage.outputTokens * pricing.costPer1kOutput) /
        1000,
    ),
    currency,
    source: 'configured_model_pricing',
    pricingVersion: pricing.pricingVersion ?? null,
  });
  return { actualModel, usage, cost: estimated.success ? estimated.data : unknownCost() };
}

export function aiProviderTestFailureFacts(error: unknown): AiProviderTestFacts {
  return {
    actualModel:
      error instanceof AiSdkGenerationError ? (error.fact.diagnostic?.actualModel ?? null) : null,
    usage: error instanceof AiSdkGenerationError ? error.usage : unknownUsage(),
    cost: unknownCost('provider_cost_unavailable'),
  };
}
