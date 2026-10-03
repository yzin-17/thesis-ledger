import type { AiProviderPricing } from './ai-provider-pricing.js';

type TestPricing = { [Key in keyof AiProviderPricing]?: AiProviderPricing[Key] | undefined };

type TestPricingInput = TestPricing & {
  modelPricing?: Record<string, TestPricing>;
  testKind?: string;
  budgetAuthorized?: boolean;
};

export function generationPricingError(input: TestPricingInput, model: string) {
  if (input.testKind !== 'generation') return undefined;
  const pricing = testPricingForModel(input, model);
  const inputCost = pricing.costPer1kInput;
  const outputCost = pricing.costPer1kOutput;
  if (inputCost === undefined || outputCost === undefined || !pricing.costCurrency)
    return '该模型费用未知或未填写完整，生成测试前请填写输入、输出单价和费用币种';
  const paid = inputCost > 0 || outputCost > 0;
  if (paid && input.budgetAuthorized !== true)
    return '该模型为非零费率，生成测试前需要明确授权本次可能产生费用';
  return undefined;
}

export function testPricingForModel(input: TestPricingInput, model: string): AiProviderPricing {
  if (input.modelPricing !== undefined) {
    const pricing = input.modelPricing[model];
    return {
      ...(pricing?.costPer1kInput === undefined ? {} : { costPer1kInput: pricing.costPer1kInput }),
      ...(pricing?.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: pricing.costPer1kOutput }),
      ...(pricing?.costCurrency === undefined ? {} : { costCurrency: pricing.costCurrency }),
      ...(pricing?.pricingVersion === undefined ? {} : { pricingVersion: pricing.pricingVersion }),
    };
  }
  return {
    ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
    ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
    ...(input.costCurrency === undefined ? {} : { costCurrency: input.costCurrency }),
    ...(input.pricingVersion === undefined ? {} : { pricingVersion: input.pricingVersion }),
  };
}
