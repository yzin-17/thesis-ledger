import { queryOptions, useQuery } from '@tanstack/react-query';
import type { BacktestRunPreparationRequestV3 } from '@thesis-ledger/schemas';
import { backtestClients } from '@thesis-ledger/api-client';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import { marketDataKeys } from '../market-data/market-data.queries.js';
import {
  fetchMarketPolicy,
  fetchMarketRouteCapabilitiesV3,
} from '../market-data/market-data.api.js';

export const prepareBacktestRunConfig = (
  input: BacktestRunPreparationRequestV3,
  signal?: AbortSignal,
  client?: DesktopRequestClient,
) => backtestClients(parsedDesktopRequest(client)).prepareCheckedRunConfig(input, signal);

export const backtestPreparationOptions = (
  currentKey: string,
  submitted: { key: string; request: BacktestRunPreparationRequestV3 } | null,
  client?: DesktopRequestClient,
) =>
  queryOptions({
    queryKey: ['backtest-preparation', currentKey, submitted?.request.requestId],
    enabled: submitted !== null && submitted.key === currentKey,
    queryFn: ({ signal }) => {
      if (!submitted || submitted.key !== currentKey) throw new Error('请重新准备当前配置');
      return prepareBacktestRunConfig(submitted.request, signal, client);
    },
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'preparing' ? 2000 : false),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export const useBacktestPreparation = (
  currentKey: string,
  submitted: { key: string; request: BacktestRunPreparationRequestV3 } | null,
) => {
  const query = useQuery(backtestPreparationOptions(currentKey, submitted));
  const stamp =
    query.data?.status === 'prepared' ? query.data.executionPreflight.revisionStamp : null;
  const stale = usePreparationRouteStale(stamp, query.dataUpdatedAt);
  return {
    ...query,
    stale,
    data: submitted?.key === currentKey && !stale ? query.data : undefined,
  };
};

export const usePreparationRouteStale = (
  stamp:
    | {
        desiredRevision: number | null;
        effectiveRevision: number | null;
        catalogRevision: number | null;
      }
    | null
    | undefined,
  preparedAt: number,
) => {
  const policy = useQuery({
    queryKey: marketDataKeys.policy(),
    queryFn: fetchMarketPolicy,
    enabled: false,
  });
  const catalog = useQuery({
    queryKey: marketDataKeys.routeCapabilities(),
    queryFn: fetchMarketRouteCapabilitiesV3,
    enabled: false,
  });
  return Boolean(
    stamp &&
    ((policy.data?.revision ?? 0) > (stamp.desiredRevision ?? 0) ||
      (policy.data?.dsaRevision ?? 0) > (stamp.effectiveRevision ?? 0) ||
      (catalog.data?.catalogRevision ?? 0) > (stamp.catalogRevision ?? 0) ||
      (policy.dataUpdatedAt >= preparedAt &&
        policy.data &&
        (policy.data.contractVersion !== 3 ||
          policy.data.revision !== stamp.desiredRevision ||
          policy.data.dsaRevision !== stamp.effectiveRevision ||
          policy.data.syncState !== 'applied' ||
          policy.data.effectiveStale)) ||
      (catalog.dataUpdatedAt >= preparedAt &&
        catalog.data &&
        (catalog.data.status !== 'complete' ||
          catalog.data.catalogRevision !== stamp.catalogRevision))),
  );
};
