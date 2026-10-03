import {
  backtestNavPreparationRequestV3Schema,
  backtestNavPreparationResultV3Schema,
  backtestNavRunCreateV3Schema,
  backtestNavRunListV3Schema,
  backtestNavRunResponseV3Schema,
  type BacktestNavPreparationRequestV3,
  type BacktestNavPreparationResultV3,
  type BacktestNavRunCreateV3,
  type BacktestNavRunResponseV3,
  type BacktestNavRunSummaryV3,
} from '@thesis-ledger/schemas';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';

export const prepareNavBacktestRun = (
  input: BacktestNavPreparationRequestV3,
  client?: DesktopRequestClient,
): Promise<BacktestNavPreparationResultV3> => {
  const request = backtestNavPreparationRequestV3Schema.parse(input);
  return requestDesktopJson<unknown>(
    '/backtests/run-config/nav/prepare',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
    client,
  ).then((response) => backtestNavPreparationResultV3Schema.parse(response));
};

export const createNavBacktestRun = (
  input: BacktestNavRunCreateV3,
  client?: DesktopRequestClient,
): Promise<BacktestNavRunResponseV3> => {
  const request = backtestNavRunCreateV3Schema.parse(input);
  return requestDesktopJson<unknown>(
    '/backtests/runs/nav',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
    client,
  ).then((response) => backtestNavRunResponseV3Schema.parse(response));
};

export const fetchNavBacktestRun = (
  runId: string,
  client?: DesktopRequestClient,
): Promise<BacktestNavRunResponseV3> =>
  requestDesktopJson<unknown>(
    `/backtests/runs/nav/${encodeURIComponent(runId)}`,
    undefined,
    client,
  ).then((response) => backtestNavRunResponseV3Schema.parse(response));

export const fetchNavBacktestRuns = (
  client?: DesktopRequestClient,
): Promise<BacktestNavRunSummaryV3[]> =>
  requestDesktopJson<unknown>('/backtests/runs/nav', undefined, client).then((response) =>
    backtestNavRunListV3Schema.parse(response),
  );

export const cancelNavBacktestRun = (
  runId: string,
  client?: DesktopRequestClient,
): Promise<BacktestNavRunResponseV3> =>
  requestDesktopJson<unknown>(
    `/backtests/runs/nav/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    client,
  ).then((response) => backtestNavRunResponseV3Schema.parse(response));

export const retryNavBacktestRun = (
  runId: string,
  client?: DesktopRequestClient,
): Promise<BacktestNavRunResponseV3> =>
  requestDesktopJson<unknown>(
    `/backtests/runs/nav/${encodeURIComponent(runId)}/retry`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    client,
  ).then((response) => backtestNavRunResponseV3Schema.parse(response));
