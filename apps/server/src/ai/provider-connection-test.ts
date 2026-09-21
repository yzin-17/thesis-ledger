import { randomUUID } from 'node:crypto';
import { aiGenerationContracts, type AiAdapter } from '@thesis-ledger/schemas';
import { z } from 'zod';
import type { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';

const connectionProbeSchema = z.object({ ok: z.literal(true) }).strict();

type ProbeInput = {
  sdk: AiSdkGenerationAdapter;
  adapter: AiAdapter;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  providerId: string;
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export const runProviderConnectionTest = async ({
  sdk,
  adapter,
  compatibilityExtensionProfile,
  providerId,
  baseURL,
  apiKey,
  model,
  timeoutMs,
}: ProbeInput) => {
  const started = Date.now();
  const result = await sdk.generate({
    requestId: randomUUID(),
    adapter,
    ...(compatibilityExtensionProfile === undefined ? {} : { compatibilityExtensionProfile }),
    providerId,
    baseURL,
    apiKey,
    model,
    messages: [{ role: 'user', content: 'Return exactly this JSON object: {"ok":true}.' }],
    contract: aiGenerationContracts.research.ref,
    schema: connectionProbeSchema,
    mode: 'json_validated',
    transport: 'single',
    maxOutputTokens: 128,
    timeout: { totalMs: timeoutMs },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { result, latencyMs: Date.now() - started };
};
