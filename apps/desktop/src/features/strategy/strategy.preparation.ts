import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestPreflightResultV3Schema,
  type BacktestRunPreparationRequestV3,
} from '@thesis-ledger/schemas';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import { marketDataKeys } from '../market-data/market-data.queries.js';
import {
  fetchMarketPolicy,
  fetchMarketRouteCapabilitiesV3,
} from '../market-data/market-data.api.js';

export const prepareBacktestRunConfig = async (
  input: BacktestRunPreparationRequestV3,
  signal?: AbortSignal,
  client?: DesktopRequestClient,
) => {
  const request = backtestRunPreparationRequestV3Schema.parse(input);
  const response = await requestDesktopJson<unknown>(
    '/backtests/run-config/prepare',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    },
    client,
  );
  const result = backtestRunPreparationResultV3Schema.parse(response);
  if (result.requestId !== request.requestId) throw new Error('配置准备响应与当前请求不一致');
  if (result.status !== 'prepared') return result;
  signal?.throwIfAborted();
  const preflight = backtestPreflightResultV3Schema.parse(await requestDesktopJson<unknown>(
    '/backtests/run-config/preflight',
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: 3, requestId: request.requestId,
        strategyVersionId: request.strategyVersionId, runConfig: result.runConfig }),
      ...(signal ? { signal } : {}) },
    client,
  ));
  signal?.throwIfAborted();
  if (preflight.requestId !== request.requestId) throw new Error('运行预检响应与当前请求不一致');
  if (preflight.status !== 'ready') {
    return backtestRunPreparationResultV3Schema.parse({
      contractVersion: 3, requestId: request.requestId, checkedAt: preflight.checkedAt,
      scope: 'execution-window', status: 'blocked', diagnostics: preflight.diagnostics,
    });
  }
  if (JSON.stringify(preflight.revisionStamp) !== JSON.stringify(result.executionPreflight.revisionStamp)) {
    throw new Error('准备与运行预检之间策略或路由已经改变，请重新准备');
  }
  return { ...result, executionPreflight: preflight };
};

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
  stamp: { desiredRevision: number | null; effectiveRevision: number | null; catalogRevision: number | null } | null | undefined,
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
    (((policy.data?.revision ?? 0) > (stamp.desiredRevision ?? 0)) ||
      ((policy.data?.dsaRevision ?? 0) > (stamp.effectiveRevision ?? 0)) ||
      ((catalog.data?.catalogRevision ?? 0) > (stamp.catalogRevision ?? 0)) ||
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
