import type { z } from 'zod';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';
import { directSchemaReferences, generationJsonSchema } from './ai-generation-json-schema.js';
import { compactGenerationSchema } from './ai-generation-schema-references.js';

function referencedDocument(schema: z.ZodType) {
  const document = generationJsonSchema(schema, 'draft-2020-12', 'ref', 'input');
  return compactGenerationSchema(directSchemaReferences(document));
}

/**
 * 由业务在预算预留前显式加入消息；只描述输出合同，不改写请求策略或模型结果。
 */
export function buildGenerationSchemaPrompt(
  schema: z.ZodType,
  reused: 'inline' | 'ref' = 'inline',
): string {
  const document =
    reused === 'ref'
      ? referencedDocument(schema)
      : generationJsonSchema(schema, 'draft-2020-12', reused, 'input');
  return (
    '你必须只返回一个符合以下完整JSON Schema的对象，包含全部必填字段，禁止额外字段、Markdown、围栏或多个JSON对象。保留用户指定的事实引用和字段取值。OUTPUT_JSON_SCHEMA:' +
    JSON.stringify(document)
  );
}

/** 只核对已准备的消息，必须在输入估算及预算预留之前调用。 */
export function assertGenerationSchemaPrompt(
  schema: z.ZodType,
  messages: readonly { role: string; content: unknown }[],
  requestId: string | null = null,
) {
  const instructions = [
    buildGenerationSchemaPrompt(schema),
    buildGenerationSchemaPrompt(schema, 'ref'),
  ];
  if (
    !messages.some((message) => {
      const content = message.content;
      return (
        typeof content === 'string' &&
        instructions.some((instruction) => content.includes(instruction))
      );
    })
  )
    throw new AiSdkGenerationError({
      code: 'configuration_invalid',
      phase: 'preflight',
      externalResult: 'not_sent',
      requestId,
      summary: '文本JSON消息缺少当前输出合同字段指令，尚未发送请求',
    });
}
