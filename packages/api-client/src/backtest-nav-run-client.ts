import {
  backtestNavPreparationResultV3Schema,
  backtestNavPreparationRequestV3Schema,
  backtestNavRunListV3Schema,
  backtestNavRunResponseV3Schema,
  backtestNavRunCreateV3Schema,
  backtestRunIdReadSchema,
  type BacktestNavPreparationRequestV3,
  type BacktestNavRunCreateV3,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedPost } from './parsed-request.js';
export function backtestNavRunClient(request: ParsedRequest, post: ParsedPost) {
  const bound = (id: string) => backtestNavRunResponseV3Schema.refine((v) => v.id === id);
  const path = (id: string) => {
    backtestRunIdReadSchema.parse(id);
    return '/backtests/runs/nav/' + encodeURIComponent(id);
  };
  return {
    prepareNavRunConfig: (input: BacktestNavPreparationRequestV3, signal?: AbortSignal) => {
      const body = backtestNavPreparationRequestV3Schema.parse(input);
      return post(
        '/backtests/run-config/nav/prepare',
        body,
        backtestNavPreparationResultV3Schema,
        signal,
      ).then((result) => {
        if (result.requestId !== body.requestId) throw Error('净值准备响应与当前请求不一致');
        return result;
      });
    },
    createNavRun: (input: BacktestNavRunCreateV3, signal?: AbortSignal) => {
      const body = backtestNavRunCreateV3Schema.parse(input);
      return post(
        '/backtests/runs/nav',
        body,
        backtestNavRunResponseV3Schema.refine(
          (v) =>
            v.preparationId === body.preparationId &&
            v.preparationHash === body.preparationHash &&
            v.idempotencyKey === body.idempotencyKey,
        ),
        signal,
      );
    },
    listNavRuns: (signal?: AbortSignal) =>
      request('/backtests/runs/nav', backtestNavRunListV3Schema, signal ? { signal } : undefined),
    getNavRun: (id: string, signal?: AbortSignal) =>
      request(path(id), bound(id), signal ? { signal } : undefined),
    cancelNavRun: (id: string, signal?: AbortSignal) =>
      post(path(id) + '/cancel', {}, bound(id), signal),
    retryNavRun: (id: string, signal?: AbortSignal) =>
      post(path(id) + '/retry', {}, bound(id), signal),
  };
}
