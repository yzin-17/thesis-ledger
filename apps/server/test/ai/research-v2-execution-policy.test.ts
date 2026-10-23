import { afterEach, expect, it, vi } from 'vitest';
import { aiGenerationContracts, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { researchSdkProtocol } from '../../src/ai/ai-research-sdk-contract.js';
import { assertResearchV2WritesEnabled } from '../../src/ai/ai-research-v2-write-policy.js';
import { sealAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { evaluateAiProviderReadiness } from '../../src/ai/ai-provider-readiness.js';
import { submissionV2Execution, submissionV2Fixture } from './research-submission-v2.fixture.js';

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, 'false', 'TRUE', '1', ' true '])('V2 新写入在开关为 %s 时保持关闭', (value) => {
  vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', value);
  expect(assertResearchV2WritesEnabled).toThrow('V2 研究提交尚未启用');
});
it('只有明确 true 才开启隔离环境的新写入', () => {
  vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
  expect(assertResearchV2WritesEnabled).not.toThrow();
});

function protocolInput() {
  const { frozen } = submissionV2Fixture();
  return {
    ownership: { runId: '00000000-0000-4000-8000-000000000010', executionAttempt: 1 },
    run: {
      provider: 'controlled-provider',
      model: 'controlled-model',
      modelMetadata: {
        sdkExecution: submissionV2Execution().sdkExecution,
        frozenResearch: sealAiFrozenResearchV2(frozen),
        researchRoutes: [
          {
            provider: 'controlled-provider',
            model: 'controlled-model',
            adapter: 'openai-compatible',
            mode: 'json_validated',
            configurationFingerprint: 'controlled-fingerprint',
          },
        ] as unknown,
      },
    },
    messages: [],
    startedAt: 0,
    signal: new AbortController().signal,
    contractVersion: 'research-generation-v2' as const,
    buildResult: () => ({}),
  };
}

it.each([
  undefined,
  [],
  [{}],
  [
    {
      provider: '',
      model: 'controlled-model',
      adapter: 'openai-compatible',
      mode: 'json_validated',
      configurationFingerprint: 'fingerprint',
    },
  ],
])('不完整的冻结路由不能回退到当前路由 %#', (routes) => {
  const input = protocolInput();
  input.run.modelMetadata.researchRoutes = routes;
  expect(() => researchSdkProtocol(input)).toThrow('缺少完整的冻结执行路由');
});
it('V1/V2 输入与保存的合同版本必须一致', () => {
  const input = protocolInput();
  expect(researchSdkProtocol(input).contract.ref).toEqual(researchGenerationV2Contract.ref);
  expect(() =>
    researchSdkProtocol({ ...input, contractVersion: 'research-generation-v1' }),
  ).toThrow('冻结版本不一致');
  input.run.modelMetadata.sdkExecution.contract = aiGenerationContracts.research.ref;
  expect(() => researchSdkProtocol(input)).toThrow('冻结版本不一致');
});
it('readiness 显式识别 V2，V1 默认合同保持原版本且没有实时验证事实', () => {
  const result = evaluateAiProviderReadiness(
    {
      providerId: 'controlled',
      baseUrl: 'http://127.0.0.1/v1',
      authMode: 'none',
      upstreamFormat: 'chat-completions',
      adapter: 'openai-compatible',
      models: ['model'],
      route: { model: 'model', mode: 'json_validated', contract: researchGenerationV2Contract.ref },
      enabled: true,
      health: 'healthy',
      credentialFingerprint: null,
      revocations: [],
      costPer1kInput: 0,
      costPer1kOutput: 0,
      costCurrency: 'USD',
    },
    { budgetAuthorized: false },
  );
  expect(result.readiness.state).toBe('ready');
  expect(result.contract).toEqual(researchGenerationV2Contract.ref);
  expect(result.liveValidation.status).toBe('not_run');
  expect(aiGenerationContracts.research.ref.version).toBe('research-generation-v1');
});
