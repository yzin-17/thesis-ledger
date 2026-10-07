import { ConflictException } from '@nestjs/common';

/** Persisted Ledger envelope format; payloadVersion has a separate economic meaning. */
export const LEDGER_STORED_ENVELOPE_VERSION = 3;

export const requireCurrentLedgerEnvelope = (version: number | null | undefined): void => {
  if (version === LEDGER_STORED_ENVELOPE_VERSION) return;
  throw new ConflictException({
    error: 'UNSUPPORTED_CONTRACT_VERSION',
    code: 'UNSUPPORTED_CONTRACT_VERSION',
    message: '旧账本事件不支持读取或修订',
  });
};
