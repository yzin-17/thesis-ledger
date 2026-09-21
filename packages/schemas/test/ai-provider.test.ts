import { describe, expect, it } from 'vitest';
import {
  aiChatImplementationSchema,
  aiUpstreamFormatSchema,
  aiUpstreamSelectionSchema,
} from '../src/ai-provider.js';

describe('AI Provider 显式上游契约', () => {
  it('只接受三种上游格式与两种 Chat 实现', () => {
    expect(aiUpstreamFormatSchema.options).toEqual([
      'chat-completions',
      'responses',
      'anthropic-messages',
    ]);
    expect(aiChatImplementationSchema.options).toEqual(['compatible', 'openai-native']);
    expect(aiUpstreamFormatSchema.safeParse('openrouter').success).toBe(false);
    expect(aiChatImplementationSchema.safeParse('@ai-sdk/openai').success).toBe(false);
  });

  it('Chat 缺省为通用兼容，非 Chat 禁止携带 Chat 实现', () => {
    expect(aiUpstreamSelectionSchema.parse({ upstreamFormat: 'chat-completions' })).toEqual({
      upstreamFormat: 'chat-completions',
      chatImplementation: 'compatible',
    });
    expect(aiUpstreamSelectionSchema.parse({ upstreamFormat: 'responses' })).toEqual({
      upstreamFormat: 'responses',
    });
    expect(
      aiUpstreamSelectionSchema.safeParse({
        upstreamFormat: 'responses',
        chatImplementation: 'compatible',
      }).success,
    ).toBe(false);
  });
});
