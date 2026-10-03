import { backtestRunResponseSchemaV3, type BacktestRunCreateV3 } from '@thesis-ledger/schemas';

type ParsedSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
type Request = <T>(path: string, schema: ParsedSchema<T>, init?: RequestInit) => Promise<T>;
type Post = <T>(path: string, body: unknown, schema: ParsedSchema<T>) => Promise<T>;

export const backtestRunClient = (request: Request, post: Post) => {
  const bound = (runId: string) => backtestRunResponseSchemaV3.refine((run) => run.id === runId);
  const path = (runId: string) => `/backtests/runs/${encodeURIComponent(runId)}`;
  return {
    createRun: (input: BacktestRunCreateV3) =>
      post('/backtests/runs', input, backtestRunResponseSchemaV3),
    getRun: (runId: string) => request(path(runId), bound(runId)),
    cancelRun: (runId: string) => post(`${path(runId)}/cancel`, {}, bound(runId)),
    retryRun: (runId: string) => post(`${path(runId)}/retry`, {}, bound(runId)),
  };
};
