import { Output, modelMessageSchema } from 'ai';
import type { z } from 'zod';
import {
  aiGenerationContractRefSchema,
  aiGenerationModeSchema,
  aiModelRequestOptionsSchema,
  type AiModelRequestOptions,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationMode,
  type AiCompatibilityExtensionProfile,
} from '@thesis-ledger/schemas';
import { isResearchV2Contract } from './ai-research-reasoning-options.js';
import { adapterSupportsGenerationMode } from './ai-provider-upstream.js';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';
import { assertGenerationSchemaPrompt } from './ai-generation-schema-prompt.js';
import { nativeStrategySchema } from './ai-native-strategy-schema.js';
import { AiGenerationOutputValidationError } from './ai-generation-output-error.js';

export const validateGenerationRequest = (input: {
  requestId: string;
  adapter: AiAdapter;
  contract: AiGenerationContractRef;
  mode: AiGenerationMode;
  messages: unknown[];
  schema: z.ZodType;
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  requestOptions?: AiModelRequestOptions;
}) => {
  aiGenerationContractRefSchema.parse(input.contract);
  aiGenerationModeSchema.parse(input.mode);
  const messages = modelMessageSchema.array().parse(input.messages);
  validateResearchReasoning(input);
  if (input.requestOptions !== undefined) aiModelRequestOptionsSchema.parse(input.requestOptions);
  if (
    input.adapter === 'anthropic-messages' &&
    input.requestOptions?.outputTokenLimit === 'upstream'
  )
    throw new AiSdkGenerationError({
      code: 'capability_unsupported',
      phase: 'preflight',
      summary: 'Anthropic Messages 必须指定输出上限',
      externalResult: 'not_sent',
      requestId: input.requestId,
    });
  if (!adapterSupportsGenerationMode(input.adapter, input.mode))
    throw new AiSdkGenerationError({
      code: 'capability_unsupported',
      phase: 'preflight',
      summary: 'Anthropic Messages 不支持无 Schema 的 API JSON Mode，请选择结构化或文本模式',
      externalResult: 'not_sent',
      requestId: input.requestId,
    });
  if (
    input.mode === 'json_mode' &&
    !messages.some((message) => /json/iu.test(JSON.stringify(message.content)))
  )
    throw new Error('API JSON Mode 的提示词必须明确要求 JSON 输出');
  if (input.mode === 'json_validated') assertGenerationSchemaPrompt(input.schema, messages, input.requestId);
};

const validateResearchReasoning = (input: {
  requestId: string;
  adapter: AiAdapter;
  contract: AiGenerationContractRef;
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
}) => {
  if (input.reasoningEnabled === undefined) return;
  if (
    !isResearchV2Contract(input.contract) ||
    input.compatibilityExtensionProfile !== 'openrouter-v1' ||
    !['openai-compatible', 'openai-compatible-chat'].includes(input.adapter) ||
    input.reasoningEffort !== undefined
  )
    throw new AiSdkGenerationError({
      code: 'capability_unsupported',
      phase: 'preflight',
      summary: '显式推理开关仅支持 OpenRouter 研究 V2，且不得与推理强度同时指定',
      externalResult: 'not_sent',
      requestId: input.requestId,
    });
};

/** One SDK output strategy for both single and streaming requests. */
export const generationOutput = <OUTPUT>(
  mode: AiGenerationMode,
  schema: z.ZodType<OUTPUT>,
  contract?: AiGenerationContractRef,
): Output.Output<unknown, unknown, never> => {
  if (mode === 'native_schema') return Output.object({ schema: nativeStrategySchema(schema, contract) });
  if (mode === 'json_mode') return Output.json();
  return Output.text();
};

/** 沿用保守字节估算；原生输出合同也属于请求输入，不能因文本去重而漏计。 */
export const generationInputBytes = async (
  messages: unknown[],
  mode: AiGenerationMode,
  schema: z.ZodType,
  contract: AiGenerationContractRef,
): Promise<number> => {
  const messageBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  if (mode !== 'native_schema') return messageBytes;
  const format = await generationOutput(mode, schema, contract).responseFormat;
  return messageBytes + Buffer.byteLength(JSON.stringify(format), 'utf8');
};

export const parseGenerationOutput = <OUTPUT>(
  mode: AiGenerationMode,
  schema: z.ZodType<OUTPUT>,
  value: unknown,
): OUTPUT => {
  // Output.object already validates with this schema. Do not apply transforms a second time.
  if (mode === 'native_schema') return value as OUTPUT;
  try {
    if (mode === 'json_mode') return schema.parse(value);
    if (typeof value !== 'string') throw new SyntaxError('Provider 未返回文本 JSON');
    const trimmed = value.trim();
    if (!trimmed) throw new SyntaxError('Provider 返回空内容');
    const fenced = /^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)[ \t]*(?:\r?\n)?```$/u.exec(trimmed);
    return schema.parse(JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    throw new AiGenerationOutputValidationError(typeof value === 'string' ? value : JSON.stringify(value) ?? '', error);
  }
};
