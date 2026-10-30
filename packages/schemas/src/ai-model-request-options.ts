import { z } from 'zod';

const protectedFields = new Set([
  'model',
  'models',
  'provider',
  'messages',
  'prompt',
  'system_prompt',
  'instructions',
  'system',
  'input',
  'stream',
  'stream_options',
  'response_format',
  'text',
  'output_config',
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'parallel_tool_calls',
  'n',
  'max_tokens',
  'max_completion_tokens',
  'max_output_tokens',
  'max_retries',
  'timeout',
  'headers',
  'url',
  'base_url',
]);
const forbiddenKey =
  /^(?:__proto__|prototype|constructor|authorization|proxy-authorization|cookie|set-cookie|password|secret|(?:x-)?api[-_]?key|credentials?|encryptedCredentials|access[-_]?token|refresh[-_]?token)$/iu;

const bodyGuard = z.unknown().superRefine((body, context) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    context.addIssue({ code: 'custom', message: '额外请求参数必须是JSON对象' });
    return;
  }
  for (const key of Object.keys(body)) {
    if (protectedFields.has(key.toLowerCase()))
      context.addIssue({ code: 'custom', path: [key], message: '该请求字段由系统合同管理' });
  }
  const pending: { value: unknown; ancestors: object[] }[] = [{ value: body, ancestors: [] }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.ancestors.length > 16) {
      context.addIssue({ code: 'custom', message: '请求参数嵌套过深' });
      return;
    }
    if (!entry.value || typeof entry.value !== 'object') continue;
    if (entry.ancestors.includes(entry.value)) {
      context.addIssue({ code: 'custom', message: '请求参数不能包含循环引用' });
      return;
    }
    for (const [key, value] of Object.entries(entry.value)) {
      if (forbiddenKey.test(key))
        context.addIssue({ code: 'custom', message: '请求参数不能包含凭据或原型键' });
      pending.push({ value, ancestors: [...entry.ancestors, entry.value] });
    }
  }
  try {
    if (JSON.stringify(body).length > 16_384)
      context.addIssue({ code: 'custom', message: '额外请求参数不得超过16384字符' });
  } catch {
    context.addIssue({ code: 'custom', message: '请求参数必须可以序列化为JSON' });
  }
});
const additionalBodySchema = bodyGuard.pipe(z.record(z.string(), z.json()));

const headersGuard = z.unknown().superRefine((headers, context) => {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    context.addIssue({ code: 'custom', message: '额外请求头必须是对象' });
    return;
  }
  if (Object.keys(headers).length > 32)
    context.addIssue({ code: 'custom', message: '最多配置32个额外请求头' });
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (
      forbiddenKey.test(lower) ||
      /(?:authorization|cookie|secret|password|credentials?|api[-_]?key|(?:^|[-_])token)$/iu.test(
        lower,
      ) ||
      [
        'host',
        'content-type',
        'content-length',
        'connection',
        'transfer-encoding',
        'te',
        'trailer',
        'upgrade',
        'proxy-connection',
      ].includes(lower)
    )
      context.addIssue({ code: 'custom', path: [name], message: '该请求头由系统协议或凭据管理' });
  }
});
const headersSchema = headersGuard.pipe(
  z.record(
    z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u, '请求头名称无效'),
    z
      .string()
      .max(2048)
      .refine(
        (value) =>
          [...value].every((char) => {
            const code = char.charCodeAt(0);
            return code >= 32 && code <= 255 && code !== 127;
          }),
        '请求头值必须为有效HTTP字节且不能含控制字符',
      ),
  ),
);

/** 用户显式配置的模型参数；不包含供应商名称或自动适配规则。 */
export const aiModelRequestOptionsSchema = z
  .object({
    body: additionalBodySchema.optional(),
    headers: headersSchema.optional(),
    outputTokenLimit: z.enum(['budget', 'upstream']).optional(),
  })
  .strict();
export type AiModelRequestOptions = z.infer<typeof aiModelRequestOptionsSchema>;
