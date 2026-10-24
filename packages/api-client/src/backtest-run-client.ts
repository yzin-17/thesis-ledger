import {
  backtestRunDetailReadSchema,
  backtestRunListReadSchema,
  backtestRunIdReadSchema,
  backtestRunCreateSchemaV3,
  type BacktestRunCreateV3,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedPost } from './parsed-request.js';

export const backtestRunClient = (request: ParsedRequest, post: ParsedPost) => {
  const bound = (runId: string) => backtestRunDetailReadSchema.refine((run) => run.id === runId);
  const path = (runId: string) => {
    backtestRunIdReadSchema.parse(runId);
    return `/backtests/runs/${encodeURIComponent(runId)}`;
  };
  return {
    listRuns: (signal?: AbortSignal) =>
      request('/backtests/runs', backtestRunListReadSchema, signal ? { signal } : undefined),
    createRun: (input: BacktestRunCreateV3, signal?: AbortSignal) => {
      const body = backtestRunCreateSchemaV3.parse(input);
      return post(
        '/backtests/runs',
        body,
        backtestRunDetailReadSchema.refine((v) => v.strategyVersionId === body.strategyVersionId),
        signal,
      );
    },
    getRun: (runId: string, signal?: AbortSignal) =>
      request(path(runId), bound(runId), signal ? { signal } : undefined),
    cancelRun: (runId: string, signal?: AbortSignal) =>
      post(`${path(runId)}/cancel`, {}, bound(runId), signal),
    retryRun: (runId: string, signal?: AbortSignal) =>
      post(`${path(runId)}/retry`, {}, bound(runId), signal),
    dispatchRun: (runId: string, signal?: AbortSignal) =>
      post(`${path(runId)}/run`, {}, bound(runId), signal),
  };
};
