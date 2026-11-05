import { describe, expect, it } from 'vitest';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { readFrozenAiResearchRoutes } from '../../src/ai/ai-research-policy.js';
import { frozenResearchRouteMatches } from '../../src/ai/ai-research-reasoning-options.js';
import { researchSdkAdapterRequest } from '../../src/ai/ai-research-sdk-contract.js';
import {
  evaluateAiProviderReadiness,
  type AiProviderRouteSnapshot,
} from '../../src/ai/ai-provider-readiness.js';

const requestOptions = {
  body: { custom: { enabled: false } },
  outputTokenLimit: 'upstream' as const,
};
const frozen = {
  provider: 'p',
  model: 'm',
  adapter: 'openai-compatible-chat',
  mode: 'json_mode',
  configurationFingerprint: 'frozen',
  requestOptions,
};
describe('研究请求参数冻结', () => {
  it('重读保留参数，改变参数即使伪造相同指纹也不匹配', () => {
    expect(readFrozenAiResearchRoutes({ researchRoutes: [frozen] })[0]).toMatchObject(frozen);
    const execution = { ...frozen, readiness: { configurationFingerprint: 'frozen' } };
    expect(frozenResearchRouteMatches(frozen, 'p', 'm', execution)).toBe(true);
    expect(frozenResearchRouteMatches(frozen, 'p', 'm', { ...execution, requestOptions: {} })).toBe(
      false,
    );
    expect(() =>
      readFrozenAiResearchRoutes({
        researchRoutes: [{ ...frozen, requestOptions: { body: { model: 'other' } } }],
      }),
    ).toThrow();
  });

  it('正式研究SDK构建传冻结参数，不发送内部预算上限', () => {
    const snapshot: AiProviderRouteSnapshot = {
      providerId: 'p',
      baseUrl: 'https://example.test/v1',
      models: ['m'],
      upstreamFormat: 'chat-completions',
      adapter: 'openai-compatible-chat',
      route: { model: 'm', mode: 'json_mode', contract: researchGenerationV2Contract.ref },
      requestOptions,
      enabled: true,
      health: 'healthy',
      credentialFingerprint: 'key',
      revocations: [],
      costPer1kInput: 0,
      costPer1kOutput: 0,
      costCurrency: 'USD',
    };
    const route = evaluateAiProviderReadiness(snapshot, { budgetAuthorized: false });
    const input = {
      requestId: 'r',
      providerId: 'p',
      model: 'm',
      runtime: { baseURL: snapshot.baseUrl, apiKey: 'key' },
      route,
      frozen,
      contract: researchGenerationV2Contract,
      messages: [{ role: 'user', content: 'JSON' }],
      signal: new AbortController().signal,
      remainingMs: 10000,
      outputTokens: 20000,
    };
    const request = researchSdkAdapterRequest(input);
    expect(request.requestOptions).toEqual(requestOptions);
    expect(request).not.toHaveProperty('maxOutputTokens');
    expect(input.outputTokens).toBe(20000);
    expect(researchSdkAdapterRequest({ ...input, frozen: undefined }).maxOutputTokens).toBe(20000);
  });
});
