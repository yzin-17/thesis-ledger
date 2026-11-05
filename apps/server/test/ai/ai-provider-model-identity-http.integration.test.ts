import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import {
  createConfigStub,
  createDbRow,
  createHealthStub,
  validSettings,
} from './ai-provider-management.fixtures.js';

describe('诊断实际模型经本机 HTTP、SDK、服务与审计透传', () => {
  it('请求别名与实际模型分别保留，不改配置或借用用途合同', async () => {
    const received: string[] = [];
    const server = createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      received.push(JSON.parse(text).model);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'identity-http',
          object: 'chat.completion',
          created: 1,
          model: 'actual/upstream-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"ok":true}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
        }),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('隔离 HTTP 地址缺失');
    const origin = `http://127.0.0.1:${address.port}`;
    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(input instanceof Request ? input.url : String(input)).origin !== origin)
        throw new Error('实际模型隔离验收禁止访问非所属地址');
      return fetchOriginal(input, { ...init, redirect: 'error' });
    });
    try {
      const configs = createConfigStub([
        createDbRow('identity-http', {
          settings: {
            ...validSettings(`${origin}/v1`, ['requested-alias']),
            costPer1kInput: 0,
            costPer1kOutput: 0,
            costCurrency: 'USD',
          },
        }),
      ]);
      const health = createHealthStub();
      const service = new AiProviderService(
        configs.service as never,
        health as never,
        new AiProviderRegistry(),
        new AiSdkGenerationAdapter(),
      );
      const result = await service.testSaved('identity-http', {
        model: 'requested-alias',
        testKind: 'connection',
      });
      expect(result).toMatchObject({
        status: 'healthy',
        model: 'requested-alias',
        actualModel: 'actual/upstream-model',
        mode: 'json_validated',
        usage: { status: 'reported', inputTokens: 4, outputTokens: 4 },
      });
      expect(received).toEqual(['requested-alias']);
      const audit = health.record.mock.calls[0]?.[6];
      expect(audit).toMatchObject({
        model: 'requested-alias',
        actualModel: 'actual/upstream-model',
        testKind: 'connection',
        mode: 'json_validated',
      });
      expect(audit).not.toHaveProperty('contract');
      expect(audit).not.toHaveProperty('purpose');
      expect(configs.service.saveAi).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });
});
