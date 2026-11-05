import { z } from 'zod';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';

/**
 * 由业务在预算预留前显式加入消息；只描述输出合同，不改写请求策略或模型结果。
 */
export function buildGenerationSchemaPrompt(schema: z.ZodType): string {
  const document = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    reused: 'inline',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema instanceof z.ZodTuple) {
        const definition = zodSchema._zod.def;
        let requiredLength = 0;
        for (let index = definition.items.length - 1; index >= 0; index--) {
          const item = definition.items[index];
          if (item && item._zod.optin !== 'optional') {
            requiredLength = index + 1;
            break;
          }
        }
        jsonSchema.minItems = Math.max(jsonSchema.minItems ?? 0, requiredLength);
        if (!definition.rest) {
          jsonSchema.maxItems = Math.min(
            jsonSchema.maxItems ?? definition.items.length,
            definition.items.length,
          );
          jsonSchema.items = false;
        }
      }
      if (jsonSchema.type === 'object' && jsonSchema.additionalProperties === undefined) {
        jsonSchema.additionalProperties = false;
      }
    },
  });
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
  const instruction = buildGenerationSchemaPrompt(schema);
  if (!messages.some((message) => typeof message.content === 'string' && message.content.includes(instruction)))
    throw new AiSdkGenerationError({
      code: 'configuration_invalid', phase: 'preflight', externalResult: 'not_sent', requestId,
      summary: '文本JSON消息缺少当前输出合同字段指令，尚未发送请求',
    });
}
