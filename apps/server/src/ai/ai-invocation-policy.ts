import type { AiInvocationFact } from '@thesis-ledger/schemas';

export const canAppendInvocationFact = (
  previous: AiInvocationFact['kind'] | null,
  next: AiInvocationFact['kind'],
) => {
  if (previous === null) return next === 'dispatching' || next === 'not_sent';
  if (previous === 'dispatching') return next === 'not_sent' || next === 'unknown' || next === 'received';
  if (previous === 'unknown') return next === 'received';
  return false;
};
