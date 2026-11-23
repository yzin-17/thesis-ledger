import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiGenerationContracts, arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { generationJsonSchema } from '../../src/ai/ai-generation-json-schema.js';
import { liveResearchContract } from '../../src/model-arena/live/live-research-contract.js';
import { buildLiveResearchMessages } from '../../src/model-arena/live/live-research-messages.js';
import { liveProtocolFixture } from './live-fixture.js';

const account = arenaLiveAccountSchema.parse({
  revision: 0,
  cash: '10000',
  positions: [],
  cashSettlements: [],
  orders: [],
  wakeups: [],
  watchedSymbols: [],
  fills: [],
});
const contexts = [
  { replay: true, allowWebSearch: false },
  { replay: true, allowWebSearch: true },
  { replay: false, allowWebSearch: false },
  { replay: false, allowWebSearch: true },
];
const tool = { action: 'tools', requests: [{ name: 'quote', symbol: '588000.SH' }] };
const decision = {
  action: 'decision',
  decision: {
    summary: '观望',
    orders: [],
    cancelOrderIds: [],
    watchedSymbols: ['588000.SH'],
    wakeups: [{ kind: 'time', at: '2026-11-03T02:00:00Z' }],
  },
};
afterEach(() => vi.unstubAllGlobals());

describe.each(contexts)('研究能力：回放=$replay 网页授权=$allowWebSearch', (context) => {
  const protocol = liveProtocolFixture({ allowWebSearch: context.allowWebSearch });
  const contract = liveResearchContract({ protocol, replay: context.replay });
  const messages = () =>
    buildLiveResearchMessages({
      protocol,
      replay: context.replay,
      account,
      asOf: '2026-11-03T01:31:00Z',
    });
  const valid = (request: unknown) =>
    contract.schema.safeParse({ action: 'tools', requests: [request] }).success;

  it('只允许当前接入的工具与周期，保留原始网页授权及通用历史合同', () => {
    const original = structuredClone(protocol);
    expect(valid({ name: 'search_instruments', query: '沪深300' })).toBe(true);
    expect(valid(tool.requests[0])).toBe(true);
    expect(valid({ name: 'financials', symbol: '588000.SH' })).toBe(false);
    expect(valid({ name: 'news', symbol: '588000.SH' })).toBe(!context.replay);
    expect(valid({ name: 'web_search', query: '公开资料' })).toBe(
      !context.replay && context.allowWebSearch,
    );
    for (const timeframe of ['1m', '5m', '15m', '60m', '1d']) {
      const allowed = timeframe !== '1d' || !context.replay;
      expect(valid({ name: 'bars', symbol: '588000.SH', timeframe, limit: 5 })).toBe(allowed);
      expect(valid({ name: 'indicators', symbol: '588000.SH', timeframe, indicator: 'MA' })).toBe(
        allowed,
      );
    }
    expect(protocol).toEqual(original);
    expect(
      aiGenerationContracts.arenaLiveResearch.schema.safeParse({
        action: 'tools',
        requests: [{ name: 'financials', symbol: '588000.SH' }],
      }).success,
    ).toBe(true);
  });

  it('提示词、上下文与校验使用同一范围，工具分支无需决策，决策仍需预约', () => {
    const [system, user] = messages();
    expect(system!.content).toContain(buildGenerationSchemaPrompt(contract.schema));
    expect(system!.content).toContain('输出该JSON后立即结束本轮回复，等待服务端返回toolResults');
    expect(system!.content).toContain('tools分支不填写decision或wakeups');
    expect(JSON.parse(user!.content)).toMatchObject({
      capabilities: contract.capabilities,
      protocol: { allowWebSearch: context.allowWebSearch },
    });
    expect(contract.schema.safeParse(tool).success).toBe(true);
    expect(contract.schema.safeParse(decision).success).toBe(true);
    expect(contract.schema.safeParse({ ...tool, decision: decision.decision }).success).toBe(false);
    expect(contract.schema.safeParse({ ...decision, requests: tool.requests }).success).toBe(false);
    expect(
      contract.schema.safeParse({
        action: 'decision',
        decision: { ...decision.decision, wakeups: [] },
      }).success,
    ).toBe(false);
    for (const count of [0, 1, 5, 6]) {
      expect(
        contract.schema.safeParse({
          action: 'tools',
          requests: Array(count).fill(tool.requests[0]),
        }).success,
      ).toBe(count >= 1 && count <= 5);
    }
  });

  it.each(['native_schema', 'json_validated', 'json_mode'] as const)(
    '%s 仅通过内存传输发送相同范围并拒绝越界回复',
    async (mode) => {
      const network = vi.fn(() => {
        throw new Error('禁止离线测试外联');
      });
      vi.stubGlobal('fetch', network);
      let body: Record<string, unknown> | undefined;
      let responseText = JSON.stringify(tool);
      const httpClient = vi.fn(async (_url: unknown, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            id: 'offline',
            object: 'chat.completion',
            created: 0,
            model: 'fixture',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: responseText },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });
      const input = {
        requestId: '781590a0-bb77-4c51-b49a-27b23c5f803f',
        adapter: 'openai-compatible-chat' as const,
        providerId: 'fixture',
        baseURL: 'https://offline.invalid/v1',
        apiKey: '',
        authMode: 'none' as const,
        model: 'fixture',
        messages: messages(),
        contract: contract.ref,
        schema: contract.schema,
        mode,
        transport: 'single' as const,
        timeout: {},
        signal: new AbortController().signal,
        httpClient,
      };
      const sdk = new AiSdkGenerationAdapter();
      expect((await sdk.generate(input)).output).toEqual(tool);
      expect(httpClient).toHaveBeenCalledTimes(1);
      expect(body).not.toHaveProperty('tools');
      expect(body).not.toHaveProperty('tool_choice');
      expect(body).not.toHaveProperty('stop');
      if (mode === 'native_schema') {
        const format = body!.response_format as {
          type: string;
          json_schema: { strict: boolean; schema: unknown };
        };
        // SDK 使用 draft-7，提示使用 2020-12；同一合同的引用名称随方言变化。
        const expected = generationJsonSchema(contract.schema, 'draft-7', 'inline', 'input');
        expect(format.type).toBe('json_schema');
        expect(format.json_schema.strict).toBe(true);
        const actual = structuredClone(format.json_schema.schema) as Record<string, unknown>;
        delete actual.$schema;
        delete expected.$schema;
        expect(actual).toEqual(expected);
      } else if (mode === 'json_mode')
        expect(body!.response_format).toEqual({ type: 'json_object' });
      else expect(body).not.toHaveProperty('response_format');
      responseText = JSON.stringify({
        action: 'tools',
        requests: [{ name: 'financials', symbol: '588000.SH' }],
      });
      await expect(sdk.generate(input)).rejects.toMatchObject({ fact: { code: 'schema_invalid' } });
      expect(httpClient).toHaveBeenCalledTimes(2);
      responseText = JSON.stringify(tool) + '\n' + JSON.stringify(decision);
      await expect(sdk.generate(input)).rejects.toThrow();
      expect(httpClient).toHaveBeenCalledTimes(3);
      expect(network).not.toHaveBeenCalled();
    },
  );
});
