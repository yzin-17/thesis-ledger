import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { authoringApi } from './authoring.api.js';

const rejectedBeforeCreation = new Set([
  'AUTHORING_CONDITIONS_INCOMPLETE',
  'AUTHORING_INSTRUMENT_MISMATCH',
  'AUTHORING_MODEL_UNAVAILABLE',
  'AUTHORING_MODEL_UNVERIFIED',
  'AUTHORING_COST_ACK_REQUIRED',
]);

export function authoringRequestFailure(error: Error): string {
  if (!(error instanceof ThesisLedgerApiError) || !error.payload?.message) return error.message;
  const issues = Array.isArray(error.payload.issues)
    ? error.payload.issues.filter((item): item is string => typeof item === 'string').slice(0, 10)
    : [];
  return [error.payload.message, ...issues].join('；');
}

export async function submitAuthoringIntent(
  id: string,
  body: Record<string, unknown>,
  onRejected: () => void,
) {
  try {
    return await authoringApi.submit(id, body);
  } catch (error) {
    if (
      error instanceof ThesisLedgerApiError &&
      error.status === 400 &&
      rejectedBeforeCreation.has(error.payload?.errorCode ?? error.payload?.error ?? '')
    )
      onRejected();
    throw error;
  }
}
