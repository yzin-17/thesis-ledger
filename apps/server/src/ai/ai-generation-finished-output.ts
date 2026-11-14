import { createHash } from 'node:crypto';
import type { FinishReason, LanguageModelUsage } from 'ai';
import type {
  AiGenerationMode,
  AiUsageFacts,
  AiGenerationFailureDiagnostic,
} from '@thesis-ledger/schemas';
import { generationFailureDiagnostic } from './ai-generation-failure-diagnostics.js';
import {
  AiSdkGenerationError,
  assertFinishReason,
  type AiGenerationCompletion,
} from './ai-sdk-generation-facts.js';

const repetitionWindow = 65_536;
const reportedCount = (value: number | undefined) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

function maximumOccurrences(parts: string[], minimumLength: number) {
  const counts = new Map<string, number>();
  let maximum = 0;
  for (const part of parts) {
    const value = part.trim();
    if (value.length < minimumLength) continue;
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    maximum = Math.max(maximum, count);
  }
  return maximum;
}

/** 仅返回摘要与有界重复统计，不归档思考文本或重复段落。 */
export function reasoningOutputDiagnostic(
  text: string | undefined,
): NonNullable<AiGenerationFailureDiagnostic['reasoningOutput']> {
  if (text === undefined) return { characters: null, sha256: null, repetition: null };
  const sample = text.slice(0, repetitionWindow);
  return {
    characters: text.length,
    sha256: createHash('sha256').update(text).digest('hex'),
    repetition: {
      sampledCharacters: sample.length,
      truncated: text.length > sample.length,
      maxLineOccurrences: maximumOccurrences(sample.split(/\r?\n/u), 8),
      maxParagraphOccurrences: maximumOccurrences(sample.split(/\r?\n\s*\r?\n/u), 32),
    },
  };
}

/** 完整单次响应的拒绝门禁：不访问可能抛错的结构化 output getter。 */
export function assertFinishedGeneration(
  result: {
    finishReason: FinishReason;
    usage: LanguageModelUsage;
    text: string;
    reasoningText: string | undefined;
  },
  request: { requestId: string; mode: AiGenerationMode },
  usage: AiUsageFacts,
  completion: AiGenerationCompletion,
) {
  if (result.finishReason === 'stop') return;
  try {
    assertFinishReason(result.finishReason, request.requestId, usage);
  } catch (error) {
    if (!(error instanceof AiSdkGenerationError)) throw error;
    const diagnostic = {
      ...generationFailureDiagnostic(
        error,
        request.mode,
        undefined,
        undefined,
        completion,
        result.text,
      ),
      reasoningOutput: reasoningOutputDiagnostic(result.reasoningText),
      outputTokenDetails: {
        textTokens: reportedCount(result.usage.outputTokenDetails?.textTokens),
        reasoningTokens: reportedCount(result.usage.outputTokenDetails?.reasoningTokens),
      },
    };
    throw new AiSdkGenerationError({ ...error.fact, diagnostic }, error.usage, {
      cause: error,
      completion,
    });
  }
}
