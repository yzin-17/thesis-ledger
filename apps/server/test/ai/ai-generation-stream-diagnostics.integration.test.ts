import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { researchGenerationV2Contract } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../src/ai/ai-sdk-generation.adapter.js';

describe('G3 当前 SDK 的真实本地 SSE 回放', () => {
  it.each([
    { name: '两字符无效 JSON', chunks: ['{', '"'], finish: 'stop', expected: 'invalid' },
    {
      name: '分片完整 JSON',
      chunks: ['{', '"answer":', '"本地回放通过"', '}'],
      finish: 'stop',
      expected: 'success',
    },
    {
      name: '合法 JSON 的字段不合格',
      chunks: ['{"answer":', '42', '}'],
      finish: 'stop',
      expected: 'valid',
    },
    {
      name: '长流与有限样本',
      chunks: Array.from({ length: 48 }, () => 'PRIVATE_BODY sk-private-token'),
      finish: 'stop',
      expected: 'invalid',
    },
    {
      name: '供应商长度终止',
      chunks: ['{"answer":'],
      finish: 'length',
      expected: 'output_truncated',
    },
  ])('$name：不重试且保持两层摘要与秘密隔离', async ({ chunks, finish, expected }) => {
    let calls = 0;
    const server = createServer(async (request, response) => {
      calls += 1;
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as {
        stream?: boolean;
        response_format?: { type?: string };
        provider?: { require_parameters?: boolean };
      };
      expect(body).toMatchObject({
        stream: true,
        response_format: { type: 'json_schema' },
        provider: { require_parameters: true },
      });
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const frame = async (choices: unknown[], usage?: unknown) => {
        const wire = Buffer.from(
          `data: ${JSON.stringify({
            id: 'offline-stream',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'fixture/model:free',
            choices,
            ...(usage ? { usage } : {}),
          })}\n\n`,
        );
        const split = Math.floor(wire.length / 2);
        response.write(wire.subarray(0, split));
        await new Promise<void>((resolve) => setImmediate(resolve));
        response.write(wire.subarray(split));
      };
      await frame([
        { index: 0, delta: { reasoning_content: 'PRIVATE_REASONING' }, finish_reason: null },
      ]);
      for (const content of chunks) {
        await frame([{ index: 0, delta: { content }, finish_reason: null }]);
        await frame([{ index: 0, delta: { reasoning: 'PRIVATE_REASONING' }, finish_reason: null }]);
      }
      await frame([{ index: 0, delta: {}, finish_reason: finish }]);
      await frame([], {
        prompt_tokens: 7,
        completion_tokens: 9,
        total_tokens: 16,
        cost: 0,
        completion_tokens_details: { reasoning_tokens: 8 },
      });
      response.end('data: [DONE]\n\n');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地 SSE fixture 未启动');
    const origin = `http://127.0.0.1:${address.port}`;
    const actualFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' || input instanceof URL ? input : input.url;
      if (new URL(url).origin !== origin) throw new Error('禁止本地回放访问外网');
      return actualFetch(input, init);
    });
    try {
      let result: unknown;
      let failure: AiSdkGenerationError | null = null;
      try {
        result = await new AiSdkGenerationAdapter().generate({
          requestId: randomUUID(),
          adapter: 'openai-compatible-chat',
          compatibilityExtensionProfile: 'openrouter-v1',
          providerId: 'offline-fixture',
          baseURL: origin + '/v1',
          apiKey: 'sk-request-secret',
          model: 'openrouter/free',
          messages: [{ role: 'user', content: 'PRIVATE_PROMPT' }],
          contract: researchGenerationV2Contract.ref,
          schema: z.strictObject({ answer: z.string() }),
          mode: 'native_schema',
          transport: 'stream',
          timeout: { totalMs: 2000, firstChunkMs: 1000, chunkMs: 1000 },
          signal: new AbortController().signal,
        });
      } catch (error) {
        if (!(error instanceof AiSdkGenerationError)) throw error;
        failure = error;
      }
      expect(calls).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      if (expected === 'success') {
        expect(failure).toBeNull();
        expect(result).toMatchObject({ output: { answer: '本地回放通过' }, providerCost: '0' });
        return;
      }
      expect(failure?.fact.code).toBe(
        expected === 'output_truncated' ? 'output_truncated' : 'schema_invalid',
      );
      const diagnostic = failure?.fact.diagnostic;
      const stream = diagnostic?.runtime?.stream;
      const sha256 = createHash('sha256').update(chunks.join('')).digest('hex');
      expect(stream?.provider?.text.sha256).toBe(sha256);
      expect(stream?.sdk.text.sha256).toBe(sha256);
      expect(stream?.provider?.reasoning.sha256).toBe(stream?.sdk.reasoning.sha256);
      expect(stream?.provider?.reportedUsage).toEqual({
        inputTokens: 7,
        outputTokens: 9,
        reasoningTokens: 8,
      });
      if (expected !== 'output_truncated') {
        expect(diagnostic?.jsonStatus).toBe(expected);
        expect(diagnostic?.outputSha256).toBe(sha256);
      }
      if (chunks.length > 24) expect(stream?.provider?.omittedFrames).toBeGreaterThan(0);
      expect(Buffer.byteLength(JSON.stringify(diagnostic))).toBeLessThanOrEqual(12 * 1024);
      expect(JSON.stringify(failure?.fact)).not.toMatch(
        /PRIVATE|sk-private-token|sk-request-secret|headers|prompt|messages/u,
      );
    } finally {
      fetchSpy.mockRestore();
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    }
  });
});
