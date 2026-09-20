import { describe, expect, it } from 'vitest';
import { FixtureAiProvider, OpenAiCompatibleProvider } from '../../src/ai/provider-adapters.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';

describe('AI Provider adapters', () => {
  it('远程 Provider 只提供 SDK 运行配置，不保留手写生成协议', () => {
    const provider = new OpenAiCompatibleProvider(
      'openrouter',
      ['m1'],
      'https://openrouter.ai/api/v1',
      'secret',
      30_000,
      undefined,
      { adapter: 'openrouter' },
    );

    expect(provider.sdkRuntime()).toEqual({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'secret',
      timeoutMs: 30_000,
    });
    expect(provider.metadata).toMatchObject({ adapter: 'openrouter' });
    expect('complete' in provider).toBe(false);
  });

  it('fixture Provider 只输出演示结构，不伪造外部来源', async () => {
    const provider = new FixtureAiProvider();
    const result = await provider.complete({
      model: 'research-fixture',
      tools: [],
      messages: [
        {
          role: 'user',
          content:
            'RESEARCH_REQUEST_JSON:' +
            JSON.stringify({
              context: { scope: 'portfolio' },
              evidence: [
                {
                  claim: '组合证据',
                  citations: [
                    {
                      toolCallId: '11111111-1111-4111-8111-111111111111',
                      tool: 'getPortfolio',
                      sourceId: 'portfolio:1',
                      provider: 'thesis-ledger',
                      observedAt: '2026-08-26T00:00:00.000Z',
                    },
                  ],
                },
              ],
            }),
        },
      ],
    });
    expect(result.content).toMatchObject({ version: 1, provider: 'fixture' });
    expect(result.content).toMatchObject({ disclaimer: expect.stringContaining('演示') });
  });

  it('fixture Provider 根据 discovery marker 返回确定性完整策略候选', async () => {
    const provider = new FixtureAiProvider();
    const seed = createDiscoverySeed({
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    });
    const result = await provider.complete({
      model: 'research-fixture',
      tools: [],
      messages: [
        {
          role: 'user',
          content: `DISCOVERY_REQUEST_JSON:${JSON.stringify({
            strategySpaceVersion: 'strategy-space-v1',
            scope: {
              executionInstrument: seed.executionInstrument,
              primaryTimeframe: seed.primaryTimeframe,
            },
            seedStrategy: seed,
          })}`,
        },
      ],
    });
    expect(result.content).toMatchObject({
      strategy: {
        schemaVersion: '2',
        executionInstrument: seed.executionInstrument,
        primaryTimeframe: '1d',
      },
    });
    expect(result.costCurrency).toBe('FIXTURE');
  });
});
