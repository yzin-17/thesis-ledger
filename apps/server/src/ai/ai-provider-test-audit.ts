import type { Prisma } from '@prisma/client';
import type { AiCostFacts, AiGenerationMode, AiUsageFacts } from '@thesis-ledger/schemas';
import type {
  AiProviderExecutionRouteInput,
  AiProviderTestStatus,
} from './ai-provider.contracts.js';
import { aiTestRuntimeFingerprint } from './ai-provider-test-fingerprint.js';
import type { AiTestRuntimeInput } from './ai-provider-test-runtime.js';

export function aiProviderTestAuditDetails(
  input: AiTestRuntimeInput,
  model: string,
  facts: { usage: AiUsageFacts; cost: AiCostFacts },
  errorCode?: string,
  status?: AiProviderTestStatus,
): Prisma.InputJsonValue {
  let route: AiProviderExecutionRouteInput | undefined;
  let mode: AiGenerationMode = 'json_validated';
  if (input.testKind === 'generation') {
    if (input.purpose !== undefined) {
      route = input.executionRoutes?.find(
        (candidate) =>
          candidate.model === model &&
          candidate.contract.id === input.purpose &&
          candidate.enabled !== false &&
          (input.mode === undefined || candidate.mode === input.mode),
      );
    }
    mode = route?.mode ?? input.mode ?? 'json_validated';
  }
  return {
    kind: 'ai_provider_test',
    testKind: input.testKind,
    model,
    adapter: input.adapter,
    mode,
    ...(input.testKind === 'generation' && input.purpose !== undefined
      ? { purpose: input.purpose }
      : {}),
    ...(route ? { contract: route.contract } : {}),
    configurationFingerprint: aiTestRuntimeFingerprint(input),
    usage: facts.usage,
    cost: facts.cost,
    ...(errorCode ? { errorCode } : {}),
    ...(status ? { status } : {}),
  };
}
