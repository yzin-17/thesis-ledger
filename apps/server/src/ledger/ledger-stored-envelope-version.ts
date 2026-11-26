import { ConflictException } from '@nestjs/common';
import { LEDGER_EVENT_ENVELOPE_CONTRACT } from '@thesis-ledger/schemas';

/** Persisted Ledger envelope format; payloadVersion has a separate economic meaning. */
export const LEDGER_STORED_ENVELOPE_VERSION = 1;

export const requireCurrentLedgerEnvelope = (version: number | null | undefined): void => {
  if (version === LEDGER_STORED_ENVELOPE_VERSION) return;
  throw new ConflictException({
    error: 'UNSUPPORTED_CONTRACT_VERSION',
    code: 'UNSUPPORTED_CONTRACT_VERSION',
    message: `账本事件须使用 ${LEDGER_EVENT_ENVELOPE_CONTRACT}`,
  });
};
