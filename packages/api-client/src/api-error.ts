import type { ApiErrorResponse } from '@thesis-ledger/schemas';

export class ThesisLedgerContractError extends Error {
  constructor(public readonly path: string) {
    super(`ThesisLedger API 响应契约不匹配: ${path}`);
  }
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds * 1000) : null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export class ThesisLedgerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorResponse | null,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(`ThesisLedger API ${status}${payload?.message ? `: ${payload.message}` : ''}`);
  }
}
