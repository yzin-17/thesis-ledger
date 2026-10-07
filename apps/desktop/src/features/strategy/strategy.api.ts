import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  BacktestJob,
  BacktestJobSummary,
  CreateStrategyVersionInput,
  CreateStrategyInput,
  QueueBacktestV3Input,
  StrategyRecord,
} from './strategy.types.js';

export const fetchStrategies = (client?: DesktopRequestClient) =>
  requestDesktopJson<StrategyRecord[]>('/backtests/strategies', undefined, client);

export const fetchBacktestJobs = (client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJobSummary[]>('/backtests/runs', undefined, client);

export const fetchBacktestJob = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(jobId)}`,
    undefined,
    client,
  );

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

export const queueBacktest = (input: QueueBacktestV3Input, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    '/backtests/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const runBacktest = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(jobId)}/run`,
    {
      method: 'POST',
    },
    client,
  );

export const cancelBacktest = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(jobId)}/cancel`,
    {
      method: 'POST',
    },
    client,
  );

export const retryBacktest = (runId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(runId)}/retry`,
    { method: 'POST' },
    client,
  );
