import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { researchGenerationV2Contract, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import {
  AiSdkGenerationAdapter,
  AiSdkGenerationError,
} from '../../src/ai/ai-sdk-generation.adapter.js';

describe('G3 脱敏失败诊断的本地 SDK 与账本往返', () => {
  it('真实 SDK 解析失败只请求一次，生产结算与读取路径保留脱敏诊断', async () => {
    let calls = 0;
    const privateText = '```json\n{"private-holding":"PRIVATE_RESPONSE sk-private-token",';
    const server = createServer(async (request, response) => {
      calls += 1;
      request.resume();
      await once(request, 'end');
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const frame = (choices: unknown[], usage?: unknown) =>
        response.write(
          `data: ${JSON.stringify({
            id: 'completion-fixture',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'fixture/model:free',
            choices,
            ...(usage ? { usage } : {}),
          })}\n\n`,
        );
      frame([{ index: 0, delta: { reasoning: 'PRIVATE_REASONING' }, finish_reason: null }]);
      frame([{ index: 0, delta: { content: privateText }, finish_reason: null }]);
      frame([{ index: 0, delta: {}, finish_reason: 'stop' }]);
      frame([], { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
      response.end('data: [DONE]\n\n');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('本地 HTTP fixture 启动失败');
      const requestId = randomUUID();
      let failure: AiSdkGenerationError | null = null;
      try {
        await new AiSdkGenerationAdapter().generate({
          requestId,
          adapter: 'openai-compatible',
          providerId: 'local-fixture',
          apiKey: 'sk-request-secret',
          baseURL: `http://127.0.0.1:${address.port}/v1`,
          model: 'fixture/model:free',
          messages: [{ role: 'user', content: 'PRIVATE_PROMPT' }],
          contract: researchGenerationV2Contract.ref,
          schema: z.strictObject({ answer: z.string() }),
          mode: 'native_schema',
          transport: 'stream',
          timeout: { totalMs: 1000, firstChunkMs: 500, chunkMs: 500 },
          signal: new AbortController().signal,
        });
      } catch (error) {
        if (!(error instanceof AiSdkGenerationError)) throw error;
        failure = error;
      }
      expect(calls).toBe(1);
      expect(failure).not.toBeNull();
      if (!failure) throw new Error('本地样本应触发解析失败');
      expect(failure.fact).toMatchObject({
        code: 'schema_invalid',
        phase: 'validation',
        externalResult: 'complete',
        requestId,
        summary: '结构化响应未通过解析或契约校验',
        diagnostic: {
          errorClass: 'no_object',
          generationMode: 'native_schema',
          finishReason: 'stop',
          actualModel: 'fixture/model:free',
          jsonStatus: 'invalid',
          outputCharacters: privateText.length,
          truncated: false,
        },
      });
      expect(failure.usage).toEqual({ status: 'reported', inputTokens: 7, outputTokens: 3 });
      const runtime = failure.fact.diagnostic?.runtime;
      expect(runtime?.packages.ai).toMatch(/^\d+\.\d+\.\d+/u);
      expect(runtime?.packages.providerVersion).toMatch(/^\d+\.\d+\.\d+/u);
      expect(runtime?.stream?.provider?.text.sha256).toBe(failure.fact.diagnostic?.outputSha256);
      expect(runtime?.stream?.sdk.text.sha256).toBe(failure.fact.diagnostic?.outputSha256);
      expect(runtime?.stream?.provider?.reasoning.sha256).toBe(
        runtime?.stream?.sdk.reasoning.sha256,
      );

      const now = new Date();
      const ownership = { runId: randomUUID(), executionAttempt: 1 };
      const run = {
        id: ownership.runId,
        status: 'running',
        executionAttempt: 1,
        leaseUntil: new Date(now.getTime() + 60_000),
        modelMetadata: { legacyKey: 'preserve-me' } as unknown,
      };
      // 模拟 JSON 存储边界；调用真实生产 Store，不声称这是 PostgreSQL 验收。
      const database = {
        $queryRaw: async () => [run],
        aiRun: {
          update: async ({ data }: { data: { modelMetadata?: unknown } }) => {
            if (data.modelMetadata !== undefined)
              run.modelMetadata = JSON.parse(JSON.stringify(data.modelMetadata));
            return run;
          },
        },
      };
      const prisma = {
        ...database,
        $transaction: (callback: (transaction: typeof database) => Promise<unknown>) =>
          callback(database),
      };
      const store = new AiExecutionStateStore(prisma as never);
      const initial: AiExecutionSummary = {
        version: 'sdk-execution-v1',
        contract: researchGenerationV2Contract.ref,
        frozenPolicy: null,
        deadlineAt: run.leaseUntil.toISOString(),
        generationStatus: 'pending',
        usageCompleteness: 'unknown',
        requests: [],
        continuationBlockedReason: null,
      };
      const cost = {
        status: 'estimated' as const,
        amount: '0',
        currency: 'USD',
        source: 'local-fixture',
        pricingVersion: 'fixture-v1',
      };
      await store.initialize(ownership, initial, now);
      await store.prepareRequest({
        ...ownership,
        requestId,
        preparedAt: now,
        reservation: { aiCalls: 1, inputTokens: 100, outputTokens: 100, cost },
      });
      expect(await store.authorizeDispatch(ownership, requestId, now)).not.toBeNull();
      const settled = await store.completeAndSettle({
        ...ownership,
        requestId,
        completedAt: now,
        error: failure.fact,
        outcome: {
          status: 'incomplete',
          finishReason: 'schema_invalid',
          contract: researchGenerationV2Contract.ref,
          schemaAccepted: false,
        },
        revision: { revision: 1, usage: failure.usage, cost, recordedAt: now.toISOString() },
      });
      expect(settled?.applied).toBe(true);
      // 使用新的 Store 实例从 JSON 边界后的记录读取，避免只验证内存对象。
      const reread = await new AiExecutionStateStore(prisma as never).initialize(
        ownership,
        initial,
        now,
      );
      expect(reread?.requests[0]?.error).toEqual(failure.fact);
      expect(reread?.requests[0]?.settledRevision).toBe(1);
      expect(run.modelMetadata).toHaveProperty('legacyKey', 'preserve-me');
      const persisted = JSON.stringify(run.modelMetadata);
      expect(persisted).not.toMatch(
        /PRIVATE_RESPONSE|private-holding|private-token|PRIVATE_PROMPT|sk-request-secret|PRIVATE_REASONING/u,
      );
      expect(persisted).not.toMatch(/"(?:cause|responseBody|headers|messages|prompt)":/u);
    } finally {
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    }
  });
});
