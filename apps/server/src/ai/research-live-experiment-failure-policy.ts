import { z } from 'zod';
import type { ExperimentRequestAudit } from './research-experiment-audit.js';
import type { LiveArmResult } from './research-live-experiment-arm.js';
import {
  matchesLiveExperimentModel,
  type LiveExperimentProtocol,
} from './research-live-experiment-protocol.js';

const confirmationSchema = z.strictObject({
  requestId: z.uuid(),
  generationId: z.string().regex(/^gen-[A-Za-z0-9_-]{1,180}$/),
  actualModel: z.string(),
  totalCostUSD: z.literal('0'),
  usageMatches: z.literal(true),
  metadataConfirmed: z.literal(true),
  jsonValid: z.literal(true),
  schemaValid: z.literal(false),
});

export async function confirmLiveSchemaFailure(
  protocol: LiveExperimentProtocol,
  result: LiveArmResult,
  confirm?: (request: ExperimentRequestAudit) => Promise<unknown>,
) {
  const request = result.requests.at(-1),
    fact = request?.facts.at(-1);
  if (
    !confirm ||
    protocol.version !== 'research-live-experiment-v3' ||
    !protocol.model.id.endsWith(':free') ||
    result.status !== 'failed' ||
    result.reason !== 'schema_invalid' ||
    !request ||
    fact?.kind !== 'received' ||
    fact.errorCode !== 'schema_invalid' ||
    fact.cost.status === 'unknown' ||
    fact.cost.currency !== 'USD' ||
    fact.cost.amount !== '0' ||
    fact.usage?.inputTokens == null ||
    fact.usage.outputTokens == null
  )
    return null;
  try {
    const value = confirmationSchema.parse(await confirm(request));
    if (
      value.requestId !== request.requestId ||
      !matchesLiveExperimentModel(protocol, value.actualModel)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
