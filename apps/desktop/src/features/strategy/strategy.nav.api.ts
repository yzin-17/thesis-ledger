import { backtestClients } from '@thesis-ledger/api-client';
import type {
  BacktestNavPreparationRequestV3,
  BacktestNavRunCreateV3,
} from '@thesis-ledger/schemas';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
const runs = (client?: DesktopRequestClient) => backtestClients(parsedDesktopRequest(client));
export const prepareNavBacktestRun = (
  input: BacktestNavPreparationRequestV3,
  client?: DesktopRequestClient,
) => runs(client).prepareNavRunConfig(input);
export const createNavBacktestRun = (
  input: BacktestNavRunCreateV3,
  client?: DesktopRequestClient,
) => runs(client).createNavRun(input);
export const fetchNavBacktestRun = (id: string, client?: DesktopRequestClient) =>
  runs(client).getNavRun(id);
export const fetchNavBacktestRuns = (client?: DesktopRequestClient) => runs(client).listNavRuns();
export const cancelNavBacktestRun = (id: string, client?: DesktopRequestClient) =>
  runs(client).cancelNavRun(id);
export const retryNavBacktestRun = (id: string, client?: DesktopRequestClient) =>
  runs(client).retryNavRun(id);
