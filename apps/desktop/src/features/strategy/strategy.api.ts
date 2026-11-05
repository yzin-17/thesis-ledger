import { strategyClients, backtestClients } from '@thesis-ledger/api-client';
import { omitUndefinedDeep } from '@thesis-ledger/schemas';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import type {
  BacktestJob,
  BacktestJobSummary,
  CreateStrategyVersionInput,
  CreateStrategyInput,
  QueueBacktestV3Input,
  StrategyRecord,
} from './strategy.types.js';
const definitions = (client?: DesktopRequestClient) =>
  strategyClients(parsedDesktopRequest(client)).definitions;
const runs = (client?: DesktopRequestClient) => backtestClients(parsedDesktopRequest(client));
export const fetchStrategies = (client?: DesktopRequestClient): Promise<StrategyRecord[]> =>
  definitions(client).list().then(omitUndefinedDeep);
export const fetchBacktestJobs = (client?: DesktopRequestClient): Promise<BacktestJobSummary[]> =>
  runs(client).listRuns().then(omitUndefinedDeep);
export const fetchBacktestJob = (id: string, client?: DesktopRequestClient): Promise<BacktestJob> =>
  runs(client).getRun(id).then(omitUndefinedDeep);
export const createStrategy = (
  input: CreateStrategyInput,
  client?: DesktopRequestClient,
): Promise<StrategyRecord> => definitions(client).create(input).then(omitUndefinedDeep);
export const createStrategyVersion = (
  input: CreateStrategyVersionInput,
  client?: DesktopRequestClient,
): Promise<StrategyRecord['versions'][number]> =>
  definitions(client).createVersion(input.strategyId, input.schema).then(omitUndefinedDeep);
export const queueBacktest = (
  input: QueueBacktestV3Input,
  client?: DesktopRequestClient,
): Promise<BacktestJob> => runs(client).createRun(input).then(omitUndefinedDeep);
export const runBacktest = (id: string, client?: DesktopRequestClient): Promise<BacktestJob> =>
  runs(client).dispatchRun(id).then(omitUndefinedDeep);
export const cancelBacktest = (id: string, client?: DesktopRequestClient): Promise<BacktestJob> =>
  runs(client).cancelRun(id).then(omitUndefinedDeep);
export const retryBacktest = (id: string, client?: DesktopRequestClient): Promise<BacktestJob> =>
  runs(client).retryRun(id).then(omitUndefinedDeep);
