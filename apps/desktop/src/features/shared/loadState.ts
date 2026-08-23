import type { LoadState } from './types.js';

export type QueryLoadSnapshot = {
  isPending: boolean;
  isError: boolean;
};

export const resolveLoadState = (
  queries: readonly QueryLoadSnapshot[],
  hasData: boolean,
  isEmpty: boolean,
): LoadState => {
  if (queries.some((query) => query.isError)) return hasData ? 'stale' : 'error';
  if (queries.some((query) => query.isPending)) return 'loading';
  return isEmpty ? 'empty' : 'ready';
};
