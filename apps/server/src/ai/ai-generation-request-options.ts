import { aiModelRequestOptionsSchema, type AiModelRequestOptions } from '@thesis-ledger/schemas';

/** 在观察和派发之前应用用户的通用参数，嵌套值整体赋值，输入保持不变。 */
export function applyGenerationRequestOptions(
  init: RequestInit | undefined,
  options: AiModelRequestOptions | undefined,
): RequestInit | undefined {
  if (!options) return init;
  const parsed = aiModelRequestOptionsSchema.parse(options);
  let actual = init;
  if (parsed.headers) {
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(parsed.headers)) headers.set(name, value);
    actual = { ...init, headers };
  }
  if (!parsed.body && parsed.outputTokenLimit !== 'upstream') return actual;
  if (typeof init?.body !== 'string') throw new Error('模型请求参数要求JSON字符串请求体');
  const source: unknown = JSON.parse(init.body);
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new Error('模型请求参数要求JSON对象请求体');
  const body = { ...source, ...parsed.body } as Record<string, unknown>;
  if (parsed.outputTokenLimit === 'upstream') {
    delete body.max_tokens;
    delete body.max_completion_tokens;
    delete body.max_output_tokens;
  }
  return { ...actual, body: JSON.stringify(body) };
}
