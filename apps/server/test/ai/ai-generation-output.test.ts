import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aiGenerationContracts, aiGenerationModeSchema } from '@thesis-ledger/schemas';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';
import { generationOutput, parseGenerationOutput } from '../../src/ai/ai-generation-output.js';
import { adapterSupportsGenerationMode } from '../../src/ai/ai-provider-upstream.js';
import { evaluateAiProviderReadiness } from '../../src/ai/ai-provider-readiness.js';

const schema = z.object({ answer: z.string().min(1) }).strict();

describe('AI generation output contracts', () => {
  it.each(['native_schema', 'json_validated', 'json_mode'] as const)(
    'preserves explicit %s through provider configuration', (mode) => {
      expect(aiGenerationModeSchema.parse(mode)).toBe(mode);
      const config = aiProviderInputSchema.parse({
        name: 'fixture', baseUrl: 'https://example.invalid/v1', models: ['fixture-model'],
        executionRoutes: [{ model: 'fixture-model', mode, contract: aiGenerationContracts.research.ref }],
      });
      expect(config.executionRoutes?.[0]?.mode).toBe(mode);
    },
  );

  it('does not accept auto as an executable mode without a capability resolver', () => {
    expect(aiGenerationModeSchema.safeParse('auto').success).toBe(false);
  });

  it('uses distinct SDK response formats', async () => {
    expect(await generationOutput('json_mode', schema).responseFormat).toEqual({ type: 'json' });
    expect(await generationOutput('json_validated', schema).responseFormat).toEqual({ type: 'text' });
    expect(await generationOutput('native_schema', schema).responseFormat).toMatchObject({
      type: 'json', schema: { type: 'object' },
    });
  });

  it('still rejects unknown fields and invalid values after syntax-only JSON mode', () => {
    expect(() => parseGenerationOutput('json_mode', schema, { answer: '' })).toThrow();
    expect(() => parseGenerationOutput('json_mode', schema, { answer: 'ok', extra: true })).toThrow();
    expect(parseGenerationOutput('json_mode', schema, { answer: 'ok' })).toEqual({ answer: 'ok' });
  });

  it('does not apply a native output transform twice', () => {
    const transformed = z.string().transform((value) => `${value}!`);
    const sdkValidatedValue = transformed.parse('ok');
    expect(parseGenerationOutput('native_schema', transformed, sdkValidatedValue)).toBe('ok!');
  });

  it('does not claim Anthropic has an API JSON-mode adapter contract', () => {
    expect(adapterSupportsGenerationMode('anthropic-messages', 'json_mode')).toBe(false);
    const result = evaluateAiProviderReadiness({
      providerId: 'fixture', baseUrl: 'https://example.invalid/v1',
      upstreamFormat: 'anthropic-messages', adapter: 'anthropic-messages', models: ['fixture-model'],
      route: { model: 'fixture-model', mode: 'json_mode', contract: aiGenerationContracts.research.ref },
      enabled: true, health: 'healthy', credentialFingerprint: 'fixture-credential', revocations: [],
    }, { budgetAuthorized: true });
    expect(result.adapterEvidence).toBeNull();
    expect(result.readiness.state).toBe('blocked');
    expect(result.readiness.reasons).toContain('adapter_contract_evidence_missing');
  });
});
