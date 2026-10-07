import {
  backtestNavPreparationResultV3Schema,
  backtestNavRunListV3Schema,
  backtestNavRunResponseV3Schema,
  type BacktestNavPreparationRequestV3,
  type BacktestNavRunCreateV3,
} from '@thesis-ledger/schemas';

type ParsedSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

type RequestParsed = <T>(path: string, schema: ParsedSchema<T>) => Promise<T>;
type PostParsed = <T>(path: string, body: unknown, schema: ParsedSchema<T>) => Promise<T>;

export function backtestNavRunClient(requestParsed: RequestParsed, postParsed: PostParsed) {
  const boundRun = (runId: string) =>
    backtestNavRunResponseV3Schema.refine((run) => run.id === runId);
  return {
    prepareNavRunConfig: (input: BacktestNavPreparationRequestV3) =>
      postParsed('/backtests/run-config/nav/prepare', input, backtestNavPreparationResultV3Schema),
    createNavRun: (input: BacktestNavRunCreateV3) =>
      postParsed('/backtests/runs/nav', input, backtestNavRunResponseV3Schema),
    listNavRuns: () => requestParsed('/backtests/runs/nav', backtestNavRunListV3Schema),
    getNavRun: (runId: string) =>
      requestParsed(`/backtests/runs/nav/${encodeURIComponent(runId)}`, boundRun(runId)),
    cancelNavRun: (runId: string) =>
      postParsed(`/backtests/runs/nav/${encodeURIComponent(runId)}/cancel`, {}, boundRun(runId)),
    retryNavRun: (runId: string) =>
      postParsed(`/backtests/runs/nav/${encodeURIComponent(runId)}/retry`, {}, boundRun(runId)),
  };
}
