import { afterEach, expect, it, vi } from 'vitest';
import { aiGenerationContracts, researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { researchSdkProtocol } from '../../src/ai/ai-research-sdk-contract.js';
import { buildFrozenResearchMessagesV2 } from '../../src/ai/ai-research-messages-v2.js';
import {
  assertGenerationSchemaPrompt,
  buildGenerationSchemaPrompt,
} from '../../src/ai/ai-generation-schema-prompt.js';
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
    contractVersion: 'research-report-generation-v1' as const,
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
it('冻结资料与保存的生成合同必须一致', () => {
  const input = protocolInput();
  expect(researchSdkProtocol(input).contract.ref).toEqual(researchGenerationV2Contract.ref);
  input.run.modelMetadata.sdkExecution.contract = aiGenerationContracts.parameterOptimization.ref;
  expect(() => researchSdkProtocol(input)).toThrow('冻结版本不一致');
});
it('反证研究冻结模板决定收窄输出 Schema，SDK 与提示词使用相同合同', () => {
  const input = protocolInput();
  const source = input.run.modelMetadata.frozenResearch;
  const frozen = sealAiFrozenResearchV2({
    ...source,
    prompt: { ...source.prompt, version: 'research-v2-counter-evidence' },
  });
  input.run.modelMetadata.frozenResearch = frozen;
  const protocol = researchSdkProtocol(input);
  const messages = buildFrozenResearchMessagesV2(frozen);
  expect(protocol.contract.ref).toEqual(researchGenerationV2Contract.ref);
  expect(() => assertGenerationSchemaPrompt(protocol.contract.schema, messages)).not.toThrow();
  expect(() => assertGenerationSchemaPrompt(researchGenerationV2Contract.schema, messages)).toThrow(
    '缺少当前输出合同',
  );
  const output = JSON.parse(
    buildGenerationSchemaPrompt(protocol.contract.schema).split('OUTPUT_JSON_SCHEMA:')[1]!,
  ) as { properties: { numericClaims: { maxItems: number } } };
  expect(output.properties.numericClaims.maxItems).toBe(0);
});

it('就绪判断使用具名研究合同并保留实时校验状态', () => {
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
  expect(aiGenerationContracts.research.ref).toEqual(researchGenerationV2Contract.ref);
});
