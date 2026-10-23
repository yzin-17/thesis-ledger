import {
  aiExecutionSummarySchema,
  aiGenerationContracts,
  aiResearchGenerationSchema,
  researchGenerationV2Contract,
  researchGenerationV2Schema,
  type AiResearchGeneration,
  type ResearchGenerationV2,
} from '@thesis-ledger/schemas';
import type { AiExecutionOwnership } from './ai-execution-state.store.js';
import type { AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';

type CommonInput = {
  ownership: AiExecutionOwnership;
  run: { provider: string; model: string; modelMetadata: unknown };
  messages: unknown[];
  startedAt: number;
  signal: AbortSignal;
};
export type ResearchExecutionInput = CommonInput &
  (
    | {
        contractVersion?: 'research-generation-v1';
        buildResult: (output: AiResearchGeneration, provider: string, model: string) => unknown;
      }
    | {
        contractVersion: 'research-generation-v2';
        buildResult: (output: ResearchGenerationV2, provider: string, model: string) => unknown;
      }
  );
export type ResearchSdkOutput = AiResearchGeneration | ResearchGenerationV2;

export function researchSdkProtocol(input: ResearchExecutionInput) {
  const value = input.run.modelMetadata;
  const metadata =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const parsed = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  if (!parsed.success || !parsed.data.frozenPolicy || !parsed.data.deadlineAt)
    throw new Error('研究任务缺少冻结执行策略');
  const version = input.contractVersion ?? 'research-generation-v1';
  if (parsed.data.contract.id !== 'research' || parsed.data.contract.version !== version)
    throw new Error('研究执行合同与任务冻结版本不一致');
  if (version === 'research-generation-v2') {
    verifyAiFrozenResearchV2(metadata.frozenResearch);
    const routes = metadata.researchRoutes;
    if (
      !Array.isArray(routes) ||
      routes.length === 0 ||
      routes.some((value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
        const route = value as Record<string, unknown>;
        return ![
          route.provider,
          route.model,
          route.configurationFingerprint,
          route.adapter,
          route.mode,
        ].every((entry) => typeof entry === 'string' && entry.length > 0);
      })
    )
      throw new Error('V2 研究任务缺少完整的冻结执行路由');
  }
  const contract =
    version === 'research-generation-v2'
      ? researchGenerationV2Contract
      : aiGenerationContracts.research;
  return { execution: parsed.data, contract };
}

export function buildResearchSdkResult(
  input: ResearchExecutionInput,
  generated: AiSdkGenerationResult<ResearchSdkOutput>,
  provider: string,
  model: string,
) {
  const actualModel = generated.actualModel ?? model;
  if (input.contractVersion === 'research-generation-v2')
    return input.buildResult(
      researchGenerationV2Schema.parse(generated.output),
      provider,
      actualModel,
    );
  return input.buildResult(
    aiResearchGenerationSchema.parse(generated.output),
    provider,
    actualModel,
  );
}
