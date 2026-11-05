import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { buildFrozenResearchMessagesV2 } from '../../src/ai/ai-research-messages-v2.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

const sample = JSON.parse(
  readFileSync(
    new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
    'utf8',
  ),
) as { generation: unknown };
const generation = researchGenerationV2Contract.schema.parse(sample.generation);
type Wire = {
  messages: { role: string; content: string }[];
  response_format: { type: string };
};

describe('完整业务提示的实际 SDK 出站', () => {
  it.each([
    { mode: 'json_mode', transport: 'single' },
    { mode: 'json_mode', transport: 'stream' },
    { mode: 'native_schema', transport: 'single' },
  ] as const)('$mode / $transport 保留提示和原结果校验', async ({ mode, transport }) => {
    const { frozen } = submissionV2Fixture();
    const messages = buildFrozenResearchMessagesV2(frozen);
    let calls = 0;
    let sent: Wire | undefined;
    const result = await new AiSdkGenerationAdapter().generate({
      requestId: randomUUID(),
      adapter: 'openai-compatible-chat',
      providerId: 'controlled-fixture',
      baseURL: 'https://controlled.invalid/v1',
      apiKey: 'controlled-key',
      model: 'controlled-model',
      messages,
      contract: researchGenerationV2Contract.ref,
      schema: researchGenerationV2Contract.schema,
      mode,
      transport,
      timeout: { totalMs: 2_000, firstChunkMs: 1_000, chunkMs: 1_000 },
      signal: new AbortController().signal,
      httpClient: async (_url, options) => {
        calls += 1;
        sent = JSON.parse(String(options?.body)) as Wire;
        const frame = { id: 'controlled-response', model: 'controlled-model', created: 1 };
        const content = JSON.stringify(generation);
        if (transport === 'stream') {
          const frames = [
            {
              ...frame,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
            },
            {
              ...frame,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            },
            {
              ...frame,
              object: 'chat.completion.chunk',
              choices: [],
              usage: {
                prompt_tokens: 5,
                completion_tokens: 2,
                total_tokens: 7,
              },
            },
          ];
          const wire =
            frames.map((item) => 'data: ' + JSON.stringify(item) + '\n\n').join('') +
            'data: [DONE]\n\n';
          return new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(
          JSON.stringify({
            ...frame,
            object: 'chat.completion',
            choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      },
    });
    expect(calls).toBe(1);
    expect(result.output).toEqual(generation);
    expect(sent?.messages.filter((message) => message.role === 'system')).toHaveLength(1);
    expect(sent?.messages[0]?.content).toBe(
      messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n'),
    );
    expect(sent?.messages.at(-1)).toEqual(messages.at(-1));
    expect(sent?.messages[0]?.content).toContain('OUTPUT_JSON_SCHEMA:');
    expect(sent).not.toHaveProperty('max_tokens');
    expect(sent).not.toHaveProperty('max_completion_tokens');
    if (mode === 'json_mode') {
      expect(sent?.response_format).toEqual({ type: 'json_object' });
    } else {
      expect(sent).toHaveProperty('response_format.type', 'json_schema');
      expect(sent).toHaveProperty(
        'response_format.json_schema.schema.$schema',
        'http://json-schema.org/draft-07/schema#',
      );
    }
  });
});
