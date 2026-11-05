import type { AiModelRequestOptions } from '@thesis-ledger/schemas';
import type { LiveExperimentProtocol } from './research-live-experiment-protocol.js';

/** 新实验只消费封存配置；缺少快照的旧协议保持当时的请求解释。 */
export function liveExperimentRequestFields(
  protocol: LiveExperimentProtocol,
  reservedOutputTokens: number,
) {
  let requestOptions: AiModelRequestOptions | undefined = protocol.requestOptions;
  if (requestOptions === undefined) {
    requestOptions = {
      ...(protocol.version === 'research-live-experiment-v5'
        ? { outputTokenLimit: 'upstream' as const }
        : {}),
      body:
        protocol.model.providerId === 'openrouter'
          ? { usage: { include: true } }
          : {
              chat_template_kwargs: { enable_thinking: false },
              ...(protocol.version === 'research-live-experiment-v5'
                ? { reasoning_effort: protocol.reasoningEffort }
                : {}),
            },
    };
  }
  const useBudget =
    requestOptions.outputTokenLimit === 'budget' ||
    (protocol.version !== 'research-live-experiment-v5' &&
      protocol.version !== 'research-live-experiment-v6');
  if (requestOptions.outputTokenLimit === 'upstream' || !useBudget) return { requestOptions };
  return { requestOptions, maxOutputTokens: reservedOutputTokens };
}

export function liveExperimentGenerationFields(protocol: LiveExperimentProtocol) {
  if (protocol.version === 'research-live-experiment-v6' && protocol.generation)
    return protocol.generation;
  return { adapter: 'openai-compatible' as const, mode: 'json_mode' as const };
}
