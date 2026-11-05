import { describe, expect, it } from 'vitest';
import * as shared from '@thesis-ledger/schemas';
import * as server from '../../src/ai/ai-provider.contracts.js';
const provider = {
  name: 'B5-contract',
  baseUrl: 'https://fixture.test/v1',
  models: ['fixture'],
  authMode: 'none',
};
describe('手机和现行 Controller 的 AI 输入合同一致性', () => {
  it.each([
    provider,
    { ...provider, apiKey: 'dummy' },
    { ...provider, models: ['fixture', 'fixture'] },
    { ...provider, authMode: 'api_key', apiKey: 'dummy', credentialsRef: 'dummy' },
    { ...provider, upstreamFormat: 'responses', chatImplementation: 'compatible' },
    { ...provider, modelPricing: { fixture: { costPer1kInput: 0 } } },
    { ...provider, modelPricing: { other: { costPer1kOutput: 1 } } },
    { ...provider, firstOutputTimeoutMs: 120001 },
    { ...provider, unexpected: true },
  ])('保存输入的接受和归一化保持一致 %#', (input) => {
    const a = shared.aiProviderInputSchema.safeParse(input);
    const b = server.aiProviderInputSchema.safeParse(input);
    expect(a.success).toBe(b.success);
    if (a.success && b.success) expect(a.data).toEqual(b.data);
  });
  it.each([
    { ...provider, testKind: 'connection' },
    {
      ...provider,
      model: 'fixture',
      testKind: 'generation',
      purpose: 'research',
      budgetAuthorized: true,
    },
    { ...provider, testKind: 'invalid' },
    { ...provider, requestId: 'invalid' },
  ])('草稿测试输入保持一致 %#', (input) => {
    const a = shared.aiProviderTestInputSchema.safeParse(input);
    const b = server.aiProviderTestInputSchema.safeParse(input);
    expect(a.success).toBe(b.success);
    if (a.success && b.success) expect(a.data).toEqual(b.data);
  });
});
