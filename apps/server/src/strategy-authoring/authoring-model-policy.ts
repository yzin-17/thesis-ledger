import {
  aiGenerationContracts,
  aiCostFactsSchema,
  type AiCostFacts,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import { createHash } from 'node:crypto';
import { aiProviderPricingForModel } from '../ai/ai-provider-pricing.js';
import type { AiProvider } from '../ai/contracts.js';

export const authoringContract = (kind: 'analyze' | 'generate' | 'modify') => {
  if (kind === 'analyze') return aiGenerationContracts.authoringAnalysis;
  if (kind === 'generate') return aiGenerationContracts.authoringGeneration;
  return aiGenerationContracts.authoringModification;
};
export const unknownAuthoringCost = (): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
});
export const authoringPricingFingerprint = (provider: AiProvider, model: string) =>
  createHash('sha256')
    .update(JSON.stringify(aiProviderPricingForModel(provider, model)))
    .digest('hex');
export const authoringCost = (
  provider: AiProvider,
  model: string,
  usage: AiUsageFacts | null,
  reported: string | null = null,
  currency: string | null = null,
): AiCostFacts => {
  if (reported !== null && currency) {
    const parsed = aiCostFactsSchema.safeParse({
      status: 'known',
      amount: reported,
      currency,
      source: 'provider_reported',
      pricingVersion: null,
    });
    if (parsed.success) return parsed.data;
  }
  const pricing = aiProviderPricingForModel(provider, model);
  if (
    pricing.costPer1kInput === undefined ||
    pricing.costPer1kOutput === undefined ||
    !pricing.costCurrency ||
    usage?.inputTokens === null ||
    usage?.outputTokens === null ||
    !usage
  )
    return unknownAuthoringCost();
  const parsed = aiCostFactsSchema.safeParse({
    status: 'estimated',
    amount: String(
      (usage.inputTokens * pricing.costPer1kInput + usage.outputTokens * pricing.costPer1kOutput) /
        1000,
    ),
    currency: pricing.costCurrency,
    source: 'configured_model_pricing',
    pricingVersion: pricing.pricingVersion ?? null,
  });
  return parsed.success ? parsed.data : unknownAuthoringCost();
};
