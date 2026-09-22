import { createHash } from 'node:crypto';
import { z } from 'zod';
import { aiGenerationModeSchema, type AiGenerationMode } from '@thesis-ledger/schemas';
import type { AiProviderInput, AiProviderExecutionRouteInput } from './ai-provider.contracts.js';
import { adapterSupportsGenerationMode } from './ai-provider-upstream.js';
import type { AiAdapter } from '@thesis-ledger/schemas';

export const VALIDATION_VERSION = 'provider-validation-v1-sdk-7.0.107';
export const VALIDATION_OUTPUT_TOKENS = 8192;
export const VALIDATION_MAX_CALLS = 24;
export const VALIDATION_DURATION_SECONDS = 300;
export const verifiedRouteSchema = z
  .object({
    fingerprint: z.string(),
    model: z.string(),
    purpose: z.string(),
    mode: aiGenerationModeSchema,
    requestId: z.uuid(),
    checkedAt: z.iso.datetime(),
    latencyMs: z.number().nonnegative().optional(),
  })
  .strict();
export type VerifiedRoute = z.infer<typeof verifiedRouteSchema>;
export const readVerifiedRoutes = (settings: unknown): VerifiedRoute[] => {
  const parsed = z
    .object({ generationValidation: z.array(verifiedRouteSchema) })
    .safeParse(settings);
  return parsed.success ? parsed.data.generationValidation : [];
};
export const validationHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const effectiveRoute = (input: AiProviderInput, route: AiProviderExecutionRouteInput) => {
  const defaults = input.modelDefaults?.[route.model];
  if (route.modeOverridden !== false || !defaults) return route;
  return {
    ...route,
    mode: defaults.mode,
    outputPolicy: defaults.outputPolicy ?? ('manual' as const),
  };
};
export const routeValidationFingerprint = (
  input: AiProviderInput,
  route: AiProviderExecutionRouteInput,
  credential: string,
  compatibilityExtensionProfile?: string,
) =>
  validationHash({
    version: VALIDATION_VERSION,
    provider: input.name,
    baseUrl: new URL(input.baseUrl).toString(),
    authMode: input.authMode,
    credential: validationHash(credential),
    protocol: input.upstreamFormat,
    implementation: input.chatImplementation ?? null,
    compatibilityExtensionProfile: compatibilityExtensionProfile ?? null,
    model: route.model,
    contract: route.contract,
    policy: route.outputPolicy ?? 'manual',
    mode: route.outputPolicy === 'auto' ? null : route.mode,
    reasoning: input.modelReasoning?.[route.model] ?? null,
    timeoutMs: input.timeoutMs ?? 120000,
    firstOutputTimeoutMs: route.firstOutputTimeoutMs ?? input.firstOutputTimeoutMs ?? 30000,
    outputIdleTimeoutMs: route.outputIdleTimeoutMs ?? input.outputIdleTimeoutMs ?? 30000,
    transport: 'stream',
  });

export const validationModes = (
  route: AiProviderExecutionRouteInput,
  adapter: AiAdapter,
  allowText: boolean,
): AiGenerationMode[] => {
  if (route.outputPolicy !== 'auto') return [route.mode];
  const modes: AiGenerationMode[] = ['native_schema', 'json_mode'];
  if (allowText) modes.push('json_validated');
  return modes.filter((mode) => adapterSupportsGenerationMode(adapter, mode));
};

/** Only machine-readable parameter rejections qualify, never an arbitrary 400 or prose. */
export const explicitlyUnsupportedFormat = (error: unknown): boolean => {
  let value: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    if (item.statusCode === 400 && typeof item.responseBody === 'string') {
      try {
        const parsed = z
          .object({ error: z.object({ code: z.string(), param: z.string() }) })
          .safeParse(JSON.parse(item.responseBody));
        if (
          parsed.success &&
          parsed.data.error.code === 'unsupported_parameter' &&
          ['response_format', 'text.format', 'output_config.format'].includes(
            parsed.data.error.param,
          )
        )
          return true;
      } catch {
        /* An unparseable error body is not capability evidence. */
      }
    }
    value = item.cause;
  }
  return false;
};
