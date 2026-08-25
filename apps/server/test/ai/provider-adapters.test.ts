import { describe, expect, it, vi } from 'vitest';
import { FixtureAiProvider, OpenAiCompatibleProvider } from '../../src/ai/provider-adapters.js';

describe('AI Provider adapters', () => {
  it('调用 OpenAI-compatible endpoint 并提取结构化 usage', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"conclusion":"ok"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    }));
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAiCompatibleProvider(
      'openai-compatible',
      ['m1'],
      'https://ai.example.test/v1',
      'secret',
    );
    await expect(
      provider.complete(
        { model: 'm1', messages: [{ role: 'user', content: 'hi' }], tools: ['getRisk'] },
        AbortSignal.timeout(1_000),
      ),
    ).resolves.toMatchObject({ content: { conclusion: 'ok' }, inputTokens: 12, outputTokens: 8 });
    expect(fetch).toHaveBeenCalledWith(
      'https://ai.example.test/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer secret' }),
      }),
    );
    vi.unstubAllGlobals();
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
});
