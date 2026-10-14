import type { AiGenerationContractRef } from '@thesis-ledger/schemas';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import type {
  AiSdkGenerationAdapter,
  AiSdkGenerationRequest,
  AiSdkGenerationResult,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import type { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyOptimizationAiSettlementStore } from '../../src/strategy-optimization/strategy-optimization-ai-settlement.store.js';
import { StrategyOptimizationSdkExecutor } from '../../src/strategy-optimization/strategy-optimization-sdk-executor.js';

type FixtureProvider = {
  id: string;
  models: string[];
  metadata: {
    costPer1kInput: number;
    costPer1kOutput: number;
    costCurrency: string;
    pricingVersion: string;
  };
  complete: () => Promise<{
    content: unknown;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    costKnown: boolean;
    actualModel: string;
  }>;
};

/** 仅替换外部生成边界，领取、请求事实和预算结算仍走真实 PostgreSQL。 */
export function createPostgresOptimizationSdk(prisma: PrismaService, provider: FixtureProvider) {
  const readyProvider = {
    ...provider,
    sdkRuntime: () => ({ baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture-secret' }),
  };
  const registry = {
    strict: () => readyProvider,
    strictReadyContract: (input: { contract: AiGenerationContractRef }) => ({
      provider: readyProvider,
      execution: {
        adapter: 'openai-compatible',
        mode: 'json_validated',
        contract: input.contract,
        readiness: { state: 'ready', reasons: [], configurationFingerprint: 'postgres-fixture-v1' },
      },
    }),
  };
  const adapter = {
    async generate<Output>(
      input: AiSdkGenerationRequest<Output>,
    ): Promise<AiSdkGenerationResult<Output>> {
      const result = await provider.complete();
      return {
        output: input.schema.parse(result.content),
        finishReason: 'stop',
        rawFinishReason: 'stop',
        usage: {
          status: 'reported',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
        actualModel: result.actualModel,
        providerCost: result.costKnown ? String(result.cost) : null,
        providerCostCurrency: result.costKnown ? provider.metadata.costCurrency : null,
        timeToFirstEventMs: null,
        timeToFirstTextMs: null,
      };
    },
  };
  const executions = new AiExecutionStateStore(prisma);
  return new StrategyOptimizationSdkExecutor(
    prisma,
    registry as unknown as AiProviderRegistry,
    adapter as unknown as AiSdkGenerationAdapter,
    executions,
    new StrategyOptimizationAiSettlementStore(executions),
  );
}
