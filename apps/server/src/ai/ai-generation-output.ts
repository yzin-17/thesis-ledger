import { Output, modelMessageSchema } from 'ai';
import type { z } from 'zod';
import {
  aiGenerationContractRefSchema,
  aiGenerationModeSchema,
  type AiAdapter,
  type AiGenerationContractRef,
  type AiGenerationMode,
  type AiCompatibilityExtensionProfile,
} from '@thesis-ledger/schemas';
import { isResearchV2Contract } from './ai-research-reasoning-options.js';
import { adapterSupportsGenerationMode } from './ai-provider-upstream.js';
import { AiSdkGenerationError } from './ai-sdk-generation-facts.js';

export const validateGenerationRequest = (input: {
  requestId: string;
  adapter: AiAdapter;
  contract: AiGenerationContractRef;
  mode: AiGenerationMode;
  messages: unknown[];
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
}) => {
  aiGenerationContractRefSchema.parse(input.contract);
  aiGenerationModeSchema.parse(input.mode);
  const messages = modelMessageSchema.array().parse(input.messages);
  validateResearchReasoning(input);
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
): Output.Output<unknown, unknown, never> => {
  if (mode === 'native_schema') return Output.object({ schema });
  if (mode === 'json_mode') return Output.json();
  return Output.text();
};

export const parseGenerationOutput = <OUTPUT>(
  mode: AiGenerationMode,
  schema: z.ZodType<OUTPUT>,
  value: unknown,
): OUTPUT => {
  // Output.object already validates with this schema. Do not apply transforms a second time.
  if (mode === 'native_schema') return value as OUTPUT;
  if (mode === 'json_mode') return schema.parse(value);
  if (typeof value !== 'string') throw new SyntaxError('Provider 未返回文本 JSON');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Provider 返回空内容');
  const fenced = /^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)[ \t]*(?:\r?\n)?```$/u.exec(trimmed);
  return schema.parse(JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown);
};
