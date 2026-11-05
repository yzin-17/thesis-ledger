import type { TextStreamPart } from 'ai';
import { sanitize } from './ai-sdk-generation-facts.js';

export function sdkSemanticProgress(part: TextStreamPart<Record<string, never>>) {
  if (part.type === 'text-delta' && part.text.length > 0) return 'text' as const;
  if (part.type === 'reasoning-delta' && part.text.length > 0) return 'reasoning' as const;
  if (part.type === 'tool-input-delta' && part.delta.length > 0) return 'tool' as const;
  if (part.type === 'tool-call') return 'tool' as const;
  return null;
}

export function sdkStreamAbortError(
  error: unknown,
  reason: string | undefined,
  signal: AbortSignal,
): Error {
  if (error) return error instanceof Error ? error : new Error(sanitize(error), { cause: error });
  if (/\b(?:First chunk|Chunk) timeout of \d+ms exceeded\b/u.test(reason ?? ''))
    return new DOMException(reason, 'TimeoutError');
  if (signal.aborted) {
    if (signal.reason instanceof Error) return signal.reason;
    return new DOMException(String(signal.reason ?? 'cancelled'), 'AbortError');
  }
  return new DOMException(reason ?? 'Provider stream aborted', 'AbortError');
}
