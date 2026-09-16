import type { AiProvider, AiProviderModelReasoningMetadata } from './contracts.js';

const reasoningEffortOrder = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const connectionTestReasoningEffort = (metadata: AiProviderModelReasoningMetadata | undefined) => {
  const supported = metadata?.supportedEfforts;
  if (!supported || supported.length === 0) return undefined;
  return reasoningEffortOrder.find(
    (effort) => supported.includes(effort) && !(metadata.mandatory === true && effort === 'none'),
  );
};

const isNonConsumableProbeError = (error: unknown) =>
  error instanceof Error &&
  (error.message === 'Provider 返回空内容' ||
    error.message === 'Provider 响应缺少 choices[0].message.content');

const isConsumableJsonObject = (content: unknown) =>
  Boolean(content && typeof content === 'object' && !Array.isArray(content));

type ProbeInput = {
  provider: Pick<AiProvider, 'complete'>;
  model: string;
  metadata: AiProviderModelReasoningMetadata | undefined;
  timeoutMs: number;
};

export const runProviderConnectionTest = async ({
  provider,
  model,
  metadata,
  timeoutMs,
}: ProbeInput) => {
  const reasoningEffort = connectionTestReasoningEffort(metadata);
  const requiresReasoning =
    metadata?.mandatory === true || (reasoningEffort !== undefined && reasoningEffort !== 'none');
  const canRetryForReasoning = reasoningEffort !== undefined && reasoningEffort !== 'none';
  let initialMaxOutputTokens = 128;
  if (requiresReasoning) initialMaxOutputTokens = 512;
  if (canRetryForReasoning) initialMaxOutputTokens = 2_048;
  const probeReasoning = () => {
    if (reasoningEffort !== undefined) return { reasoningEffort };
    if (requiresReasoning) return {};
    return { reasoningEffort: 'none' as const };
  };
  const probe = (maxOutputTokens: number) =>
    provider.complete(
      {
        model,
        messages: [{ role: 'user', content: 'Return exactly a minimal JSON object: {"ok":true}.' }],
        tools: [],
        maxOutputTokens,
        ...probeReasoning(),
      },
      AbortSignal.timeout(timeoutMs),
    );
  const started = Date.now();
  let result;
  try {
    result = await probe(initialMaxOutputTokens);
  } catch (error) {
    if (!canRetryForReasoning || !isNonConsumableProbeError(error)) throw error;
    result = await probe(4_096);
  }
  if (!isConsumableJsonObject(result.content)) {
    if (!canRetryForReasoning) throw new Error('Provider 未返回 JSON 对象');
    result = await probe(4_096);
  }
  if (!isConsumableJsonObject(result.content)) throw new Error('Provider 未返回 JSON 对象');
  return { result, latencyMs: Date.now() - started };
};
