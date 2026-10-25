import { describe, expect, it } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderModelExecutionSchema,
  researchGenerationV2Contract,
} from '../src/index.js';

const execution = {
  model: 'openrouter/free',
  adapter: 'openai-compatible-chat',
  compatibilityExtensionProfile: 'openrouter-v1',
  mode: 'native_schema',
  contract: researchGenerationV2Contract.ref,
  adapterEvidence: null,
  readiness: {
    state: 'blocked',
    reasons: ['adapter_contract_evidence_missing'],
    configurationFingerprint: 'local',
    evaluatedAt: '2026-10-24T00:00:00Z',
  },
  liveValidation: { status: 'not_run', checkedAt: null, requestId: null },
};

describe('研究用途显式推理开关合同', () => {
  it('保留显式 false／true，旧记录可以省略', () => {
    expect(
      aiProviderModelExecutionSchema.parse({ ...execution, reasoningEnabled: false })
        .reasoningEnabled,
    ).toBe(false);
    expect(
      aiProviderModelExecutionSchema.parse({ ...execution, reasoningEnabled: true })
        .reasoningEnabled,
    ).toBe(true);
    expect(aiProviderModelExecutionSchema.parse(execution)).not.toHaveProperty('reasoningEnabled');
    expect(
      aiProviderModelExecutionSchema.parse({
        ...execution,
        contract: aiGenerationContracts.research.ref,
      }),
    ).not.toHaveProperty('reasoningEnabled');
  });
  it('拒绝 V1／其他用途和非布尔值', () => {
    for (const contract of [
      aiGenerationContracts.research.ref,
      aiGenerationContracts.authoringAnalysis.ref,
    ])
      expect(
        aiProviderModelExecutionSchema.safeParse({
          ...execution,
          contract,
          reasoningEnabled: false,
        }).success,
      ).toBe(false);
    expect(
      aiProviderModelExecutionSchema.safeParse({ ...execution, reasoningEnabled: 'false' }).success,
    ).toBe(false);
  });
});
