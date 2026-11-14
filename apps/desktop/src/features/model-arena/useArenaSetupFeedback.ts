import { useRef, useState } from 'react';
import { arenaSetupFailureFields, type ArenaSetupErrors } from '@thesis-ledger/api-client';

export function useArenaSetupFeedback(signature: string, validation: ArenaSetupErrors, failure: unknown, failedSignature: string | undefined, live: boolean) {
  const root = useRef<HTMLFormElement>(null), [attempted, setAttempted] = useState(false);
  const currentFailure = failedSignature === signature ? failure : null;
  const remote = arenaSetupFailureFields(currentFailure, live);
  const errors = { ...(attempted ? validation : {}), ...remote };
  const focusErrors = () => requestAnimationFrame(() => {
    const target = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([aria-hidden="true"])');
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' });
  });
  const beginSubmit = () => {
    setAttempted(true);
    if (Object.keys(validation).length || root.current?.querySelector('[data-slot="date-input"] input[aria-invalid="true"]')) {
      focusErrors(); return false;
    }
    return true;
  };
  return { root, errors, beginSubmit, focusErrors, requestError: Object.keys(remote).length ? null : currentFailure };
}
