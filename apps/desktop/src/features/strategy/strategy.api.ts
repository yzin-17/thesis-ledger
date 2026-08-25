import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  BacktestJob,
  CreateStrategyVersionInput,
  CreateStrategyInput,
  QueueBacktestInput,
  StrategyRecord,
} from './strategy.types.js';

export const fetchStrategies = (client?: DesktopRequestClient) =>
  requestDesktopJson<StrategyRecord[]>('/backtests/strategies', undefined, client);

export const fetchBacktestJobs = (client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob[]>('/backtests/jobs', undefined, client);

export const createStrategy = (input: CreateStrategyInput, client?: DesktopRequestClient) =>
  requestDesktopJson<StrategyRecord>(
    '/backtests/strategies',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const createStrategyVersion = (
  input: CreateStrategyVersionInput,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<StrategyRecord['versions'][number]>(
    `/backtests/strategies/${encodeURIComponent(input.strategyId)}/versions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: input.schema }),
    },
    client,
  );

export const fetchStrategyBars = async (symbol: string, client?: DesktopRequestClient) => {
  try {
    return await requestDesktopJson<unknown[]>(
      `/market/${encodeURIComponent(symbol)}/bars?timeframe=1d&t=${Date.now()}`,
      { cache: 'no-store' },
      client,
    );
  } catch (error) {
    if (error instanceof ThesisLedgerApiError) return [];
    throw error;
  }
};

export const queueBacktest = (input: QueueBacktestInput, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    '/backtests/jobs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const runBacktest = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/jobs/${encodeURIComponent(jobId)}/run`,
    {
      method: 'POST',
    },
    client,
  );

export const cancelBacktest = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/jobs/${encodeURIComponent(jobId)}/cancel`,
    {
      method: 'POST',
    },
    client,
  );
