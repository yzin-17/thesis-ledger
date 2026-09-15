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

  it('支持 content parts、Responses envelope 和 legacy text，同时拒绝空内容', async () => {
    const responses = [
      {
        choices: [
          {
            message: {
              role: 'assistant',
              reasoning: 'internal reasoning',
              content: [{ type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' }],
            },
          },
        ],
      },
      {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"ok":true}' }],
          },
        ],
      },
      { choices: [{ text: '{"ok":true}' }] },
      { choices: [{ message: { reasoning: 'only reasoning' } }] },
    ];
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    }));
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAiCompatibleProvider(
      'openrouter',
      ['m1'],
      'https://openrouter.ai/api/v1',
      'secret',
    );
    const input = { model: 'm1', messages: [{ role: 'user', content: 'hi' }], tools: [] };

    await expect(provider.complete(input, AbortSignal.timeout(1_000))).resolves.toMatchObject({
      content: { ok: true },
    });
    await expect(provider.complete(input, AbortSignal.timeout(1_000))).resolves.toMatchObject({
      content: { ok: true },
    });
    await expect(provider.complete(input, AbortSignal.timeout(1_000))).resolves.toMatchObject({
      content: { ok: true },
    });
    await expect(provider.complete(input, AbortSignal.timeout(1_000))).rejects.toThrow(
      'Provider 响应缺少 choices[0].message.content',
    );
    vi.unstubAllGlobals();
  });

  it('连接测试关闭 reasoning，避免小 token 预算只返回推理字段', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      ...(init?.body
        ? { request: (requestBody = JSON.parse(String(init.body)) as Record<string, unknown>) }
        : {}),
    }));
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAiCompatibleProvider(
      'openrouter',
      ['m1'],
      'https://openrouter.ai/api/v1',
      'secret',
    );
    await provider.complete(
      {
        model: 'm1',
        messages: [{ role: 'user', content: 'Return JSON' }],
        tools: [],
        maxOutputTokens: 128,
        reasoningEffort: 'none',
      },
      AbortSignal.timeout(1_000),
    );
    expect(requestBody).toMatchObject({ reasoning: { effort: 'none' } });
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
