import type { AiSdkGenerationRequest } from '../../src/ai/ai-sdk-generation.adapter.js';
import { createHash } from 'node:crypto';
import { tradePlanWireOutput } from './trade-plan-wire-output.fixture.js';

/** 记录模型、输出合同及消息摘要，不读取或保存请求头、凭证或推理内容。 */
export function tradePlanWireCapture(
  request: AiSdkGenerationRequest<unknown>,
  capture: (name: string, value: unknown) => void,
  call: number,
): typeof fetch {
  const forward = request.httpClient ?? fetch;
  let attempt = 0;
  return async (url, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const current = ++attempt;
    capture(`wire-${call}-${current}.json`, {
      model: body.model,
      responseFormat: body.response_format,
      messages: (body.messages ?? []).map((message: { role: string; content: unknown }) => ({
        role: message.role,
        contentBytes: Buffer.byteLength(JSON.stringify(message.content)),
        contentSha256: createHash('sha256').update(JSON.stringify(message.content)).digest('hex'),
      })),
    });
    return tradePlanWireOutput(await forward(url, init), (value) =>
      capture(`wire-output-${call}-${current}.json`, value),
    );
  };
}
