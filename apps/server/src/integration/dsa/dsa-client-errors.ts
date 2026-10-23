import { DsaV3ProtocolError, type DsaV3ErrorCode } from './dsa-v3-protocol.js';

export class DsaError extends DsaV3ProtocolError {}
export type HttpErrorMapper = (status: number, payload: unknown) => DsaV3ProtocolError;

export function toDsaError(error: DsaV3ProtocolError): DsaError {
  if (error instanceof DsaError) return error;
  return new DsaError(error.message, error.code, error.status, error.sourceReason);
}

export function parseV3Response<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof DsaV3ProtocolError) throw toDsaError(error);
    throw error;
  }
}

export function controlErrorCode(detailCode: string | undefined, status: number): DsaV3ErrorCode {
  if (detailCode === 'unauthorized') return 'unauthorized';
  if (detailCode === 'unsupported_capability') return 'unsupported-capability';
  if (detailCode === 'STALE_REVISION') return 'stale-revision';
  if (status === 409 || status === 422) return 'control-rejected';
  return 'unavailable';
}
