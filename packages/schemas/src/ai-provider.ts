import { z } from 'zod';

export const aiUpstreamFormatSchema = z.enum([
  'chat-completions',
  'responses',
  'anthropic-messages',
]);
export type AiUpstreamFormat = z.infer<typeof aiUpstreamFormatSchema>;

export const aiChatImplementationSchema = z.enum(['compatible', 'openai-native']);
export type AiChatImplementation = z.infer<typeof aiChatImplementationSchema>;

export const aiCompatibilityExtensionProfileSchema = z.literal('openrouter-v1');
export type AiCompatibilityExtensionProfile = z.infer<typeof aiCompatibilityExtensionProfileSchema>;

export const aiSdkProviderImplementationSchema = z.enum([
  'openai-compatible-chat',
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
]);
export type AiSdkProviderImplementation = z.infer<typeof aiSdkProviderImplementationSchema>;

export const aiUpstreamSelectionSchema = z
  .object({
    upstreamFormat: aiUpstreamFormatSchema,
    chatImplementation: aiChatImplementationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.upstreamFormat !== 'chat-completions' && value.chatImplementation !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['chatImplementation'],
        message: '只有 Chat Completions 可以选择 Chat 实现',
      });
  })
  .transform((value) => ({
    upstreamFormat: value.upstreamFormat,
    ...(value.upstreamFormat === 'chat-completions'
      ? { chatImplementation: value.chatImplementation ?? ('compatible' as const) }
      : {}),
  }));
export type AiUpstreamSelection = z.output<typeof aiUpstreamSelectionSchema>;
