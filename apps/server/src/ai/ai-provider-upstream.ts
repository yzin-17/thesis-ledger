import {
  aiCompatibilityExtensionProfileSchema,
  aiUpstreamSelectionSchema,
  type AiChatImplementation,
  type AiCompatibilityExtensionProfile,
  type AiLegacyAdapter,
  type AiSdkProviderImplementation,
  type AiUpstreamFormat,
  type AiUpstreamSelection,
} from '@thesis-ledger/schemas';

export const AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1 =
  aiCompatibilityExtensionProfileSchema.value;
export type { AiCompatibilityExtensionProfile, AiSdkProviderImplementation };

export const resolveAiSdkProviderImplementation = (input: {
  upstreamFormat: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
}): AiSdkProviderImplementation => {
  const selection = aiUpstreamSelectionSchema.parse(input);
  if (selection.upstreamFormat === 'responses') return 'openai-responses';
  if (selection.upstreamFormat === 'anthropic-messages') return 'anthropic-messages';
  return selection.chatImplementation === 'openai-native'
    ? 'openai-chat'
    : 'openai-compatible-chat';
};

export const selectionFromLegacyAdapter = (adapter: AiLegacyAdapter): AiUpstreamSelection => {
  void adapter;
  return aiUpstreamSelectionSchema.parse({
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
  });
};

export const runtimeAdapterForSelection = (
  selection: AiUpstreamSelection,
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile,
): AiSdkProviderImplementation => {
  void compatibilityExtensionProfile;
  return resolveAiSdkProviderImplementation(selection);
};
