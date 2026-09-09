import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  BacktestJob,
  BacktestJobSummary,
  CreateStrategyVersionInput,
  CreateStrategyInput,
  FetchStrategyBarsInput,
  QueueBacktestInput,
  QueueBacktestV2Input,
  StrategyRecord,
} from './strategy.types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const compactBacktestBar = (value: unknown) => {
  if (!isRecord(value)) return null;
  const dateSource = typeof value.date === 'string' ? value.date : value.timestamp;
  if (
    typeof value.symbol !== 'string' ||
    typeof dateSource !== 'string' ||
    !finiteNumber(value.open) ||
    !finiteNumber(value.high) ||
    !finiteNumber(value.low) ||
    !finiteNumber(value.close)
  ) {
    return null;
  }
  return {
    symbol: value.symbol,
    date: dateSource.slice(0, 10),
    open: value.open,
    high: value.high,
    low: value.low,
    close: value.close,
    ...(finiteNumber(value.volume) ? { volume: value.volume } : {}),
    ...(finiteNumber(value.previousClose) ? { previousClose: value.previousClose } : {}),
    ...(typeof value.suspended === 'boolean' ? { suspended: value.suspended } : {}),
    ...(typeof value.availableAt === 'string' ? { availableAt: value.availableAt } : {}),
    ...(typeof value.assetType === 'string' ? { assetType: value.assetType } : {}),
    ...(finiteNumber(value.dividend) ? { dividend: value.dividend } : {}),
    ...(finiteNumber(value.splitFactor) ? { splitFactor: value.splitFactor } : {}),
  };
};

export const fetchStrategies = (client?: DesktopRequestClient) =>
  requestDesktopJson<StrategyRecord[]>('/backtests/strategies', undefined, client);

export const fetchBacktestJobs = (client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJobSummary[]>('/backtests/jobs/summary', undefined, client);

export const fetchBacktestJob = (jobId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/jobs/${encodeURIComponent(jobId)}`,
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

export const fetchStrategyBars = async (
  input: FetchStrategyBarsInput,
  client?: DesktopRequestClient,
) => {
  const query = new URLSearchParams({
    timeframe: '1d',
    start: input.period.start,
    end: input.period.end,
    limit: '365',
    t: String(Date.now()),
  });
  try {
    const bars = await requestDesktopJson<unknown[]>(
      `/market/${encodeURIComponent(input.symbol)}/bars?${query.toString()}`,
      { cache: 'no-store' },
      client,
    );
    return bars.map(compactBacktestBar).filter((bar) => bar !== null);
  } catch (error) {
    if (error instanceof ThesisLedgerApiError) return [];
    throw error;
  }
};

export const queueBacktest = (
  input: QueueBacktestInput | QueueBacktestV2Input,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<BacktestJob>(
    'runConfig' in input ? '/backtests/runs' : '/backtests/jobs',
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

export const runBacktestV2 = (runId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(runId)}/run`,
    { method: 'POST' },
    client,
  );

export const cancelBacktestV2 = (runId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST' },
    client,
  );

export const retryBacktestV2 = (runId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<BacktestJob>(
    `/backtests/runs/${encodeURIComponent(runId)}/retry`,
    { method: 'POST' },
    client,
  );
