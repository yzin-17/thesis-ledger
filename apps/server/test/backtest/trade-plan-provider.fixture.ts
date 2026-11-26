import { randomUUID } from 'node:crypto';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { validateProviderRoute } from '../../src/ai/ai-provider-validation-runner.js';
import { routeValidationFingerprint } from '../../src/ai/ai-provider-validation-policy.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { createStoredAiProvider } from '../../src/ai/ai-provider-runtime.js';
import { routeSnapshotsFromProviderRow } from '../../src/ai/ai-provider-readiness.persistence.js';
import { tradePlanWireCapture } from './trade-plan-wire.fixture.js';

/** 私有资格副本，只探针当前合同，不修改真实 Provider、路由或资格。 */
export async function tradePlanProvider(
  source: Parameters<typeof createStoredAiProvider>[0],
  capture: (name: string, value: unknown) => void,
  entry: 'discovery' | 'authoring' | 'authoring-modification' | 'authoring-analysis' = 'discovery',
) {
  const contract = {
    discovery: aiGenerationContracts.strategyDiscovery,
    authoring: aiGenerationContracts.authoringGeneration,
    'authoring-modification': aiGenerationContracts.authoringModification,
    'authoring-analysis': aiGenerationContracts.authoringAnalysis,
  }[entry];
  const row = { ...source, updatedAt: new Date(source.updatedAt), encryptedCredentials: null };
  const settings = parseAiProviderSettings(row.settings);
  if (!settings) throw new Error('本地模型配置无效');
  const model = settings.models[0]!;
  if (settings.authMode !== 'none') throw new Error('验收仅支持已授权的本地无凭证模型');
  const existing = settings.executionRoutes?.find(
    (r) => r.model === model && r.contract.id === contract.ref.id,
  );
  if (!existing) throw new Error('策略用途路由尚未配置');
  const mode = process.env.BACKTEST_PLAN_GENERATION_MODE;
  if (mode && !['native_schema', 'json_validated'].includes(mode))
    throw new Error('隔离验收的候选生成模式无效');
  const route = {
    ...existing,
    ...(mode ? { mode: mode as 'native_schema' | 'json_validated' } : {}),
    contract: contract.ref,
    outputPolicy: 'manual' as const,
    modeOverridden: true,
  };
  const rate = settings.modelPricing?.[model];
  if (!rate) throw new Error('本地模型缺少费率');
  if (rate.costPer1kInput !== 0 || rate.costPer1kOutput !== 0)
    throw new Error('本地零费率断言失败');
  const input = aiProviderInputSchema.parse({
    name: row.name,
    baseUrl: settings.baseUrl,
    models: [model],
    authMode: 'none',
    upstreamFormat: settings.upstreamFormat,
    chatImplementation: settings.chatImplementation,
    modelPricing: {
      [model]: {
        costPer1kInput: rate.costPer1kInput,
        costPer1kOutput: rate.costPer1kOutput,
        costCurrency: rate.costCurrency,
      },
    },
    modelDefaults: settings.modelDefaults,
    modelReasoning: settings.modelReasoning,
    executionRoutes: [route],
  });
  const adapter = new AiSdkGenerationAdapter(),
    history: unknown[] = [];
  const generate = adapter.generate.bind(adapter);
  let calls = 0;
  adapter.generate = async (request) => {
    const call = ++calls;
    capture(`request-${call}.json`, {
      contract: request.contract,
      messages: request.messages,
      mode: request.mode,
      maxOutputTokens: request.maxOutputTokens,
    });
    try {
      const result = await generate({
        ...request,
        httpClient: tradePlanWireCapture(request, capture, call),
      });
      capture(`response-${call}.json`, result);
      return result;
    } catch (error) {
      const causes: unknown[] = [];
      let current = error as {
        cause?: unknown;
        text?: string;
        message?: string;
        value?: unknown;
        errors?: unknown;
      };
      for (let depth = 0; current && depth < 6; depth++) {
        causes.push({
          message: current.message,
          text: current.text,
          value: current.value,
          errors: current.errors,
        });
        current = current.cause as typeof current;
      }
      capture(`response-${call}.json`, { message: String(error), ...(error as object), causes });
      throw error;
    }
  };
  let qualified;
  try {
    qualified = await validateProviderRoute(
      {
        input,
        credential: '',
        operationId: randomUUID(),
        signal: AbortSignal.timeout(300000),
        deadline: Date.now() + 300000,
        remainingCalls: 1,
        allowText: false,
        stopOnFirstFailure: true,
      },
      route,
      routeValidationFingerprint(input, route, ''),
      adapter,
      {
        recordHistory: async (...args) => {
          history.push(args);
          return null;
        },
      },
    );
  } finally {
    capture('qualification.json', history);
  }
  row.settings = {
    ...settings,
    executionRoutes: [route],
    generationValidation: [qualified.record],
  };
  const provider = await createStoredAiProvider(
    row,
    {
      readCredential: () => {
        throw new Error('禁止读取凭证');
      },
    },
    30000,
  );
  if (!provider) throw new Error('Provider 装配失败');
  const registry = new AiProviderRegistry();
  registry.replace(
    [provider],
    routeSnapshotsFromProviderRow(row, parseAiProviderSettings(row.settings), row.health),
  );
  return {
    adapter,
    model,
    resolved: registry.strictReadyContract({
      providerId: row.name,
      model,
      contract: route.contract,
      budgetAuthorized: true,
    }),
    row,
  };
}
