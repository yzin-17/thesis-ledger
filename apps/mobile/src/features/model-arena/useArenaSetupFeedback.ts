import { useState } from 'react';
import { arenaSetupFailureFields, type ArenaSetupErrors } from '@thesis-ledger/api-client';

export function useArenaSetupFeedback(signature: string, validation: ArenaSetupErrors, failure: unknown, failedSignature: string | undefined, live: boolean) {
  const [attempted, setAttempted] = useState(false);
  const currentFailure = failedSignature === signature ? failure : null;
  const remote = arenaSetupFailureFields(currentFailure, live);
  return {
    errors: { ...(attempted ? validation : {}), ...remote },
    requestError: Object.keys(remote).length ? null : currentFailure,
    beginSubmit() { setAttempted(true); return Object.keys(validation).length === 0; },
  };
}
