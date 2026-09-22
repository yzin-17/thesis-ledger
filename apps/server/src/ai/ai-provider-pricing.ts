import type { AiProvider } from './contracts.js';

export type AiProviderPricing = {
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
};

export const aiProviderPricingForModel = (
  provider: Pick<AiProvider, 'metadata'>,
  model: string,
): AiProviderPricing => {
  const modelPricing = provider.metadata?.modelPricing?.[model];
  if (modelPricing)
    return {
      ...(modelPricing.costPer1kInput === undefined
        ? {}
        : { costPer1kInput: modelPricing.costPer1kInput }),
      ...(modelPricing.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: modelPricing.costPer1kOutput }),
      ...(modelPricing.costCurrency === undefined
        ? {}
        : { costCurrency: modelPricing.costCurrency }),
      pricingVersion: modelPricing.pricingVersion,
    };
  return {
    ...(provider.metadata?.costPer1kInput === undefined
      ? {}
      : { costPer1kInput: provider.metadata.costPer1kInput }),
    ...(provider.metadata?.costPer1kOutput === undefined
      ? {}
      : { costPer1kOutput: provider.metadata.costPer1kOutput }),
    ...(provider.metadata?.costCurrency === undefined
      ? {}
      : { costCurrency: provider.metadata.costCurrency }),
    ...(provider.metadata?.pricingVersion === undefined
      ? {}
      : { pricingVersion: provider.metadata.pricingVersion }),
  };
};
