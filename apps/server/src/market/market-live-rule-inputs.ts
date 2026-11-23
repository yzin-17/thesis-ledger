import { randomUUID } from 'node:crypto';
import {
  statusCompositionDemandV1Schema,
  type MarketPublicFeesResponseV3,
  type MarketStatusCompositionV1,
} from '@thesis-ledger/schemas';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import type { MarketLifecycleReaderV3 } from './market-lifecycle-reader-v3.js';
import { sameStatusCompositionPolicyV1 } from './market-status-composition-reader-v1.js';

export type LiveInputDiagnostic = {
  field: string;
  status: 'available' | 'unavailable';
  reason?: string;
};
export type LiveRulePort = Pick<DsaClient, 'effectiveControlPolicyV3' | 'marketPublicFeesV3'>;
type Scope = { market: 'CN' | 'HK'; symbol: string; assetType: 'STOCK' | 'ETF' };
export function failedLiveInput(field: string, error: unknown): LiveInputDiagnostic {
  const detail = error as { sourceReason?: string; code?: string };
  return {
    field,
    status: 'unavailable',
    reason: detail?.sourceReason ?? detail?.code ?? 'unavailable',
  };
}

/** 当前收费按既有精确目标读取；缺少路由时保留对应缺口，不扩大行情请求。 */
export async function readLiveRuleInputs(
  dsa: LiveRulePort,
  status: Pick<MarketLifecycleReaderV3, 'readComposition'>,
  scope: Scope,
  day: string,
) {
  const policy = (await dsa.effectiveControlPolicyV3()).projection?.effective;
  const diagnostics: LiveInputDiagnostic[] = [];
  const route = (capability: string) =>
    policy?.enabled
      ? policy.routes.find(
          (row) =>
            row.key.kind === 'data' &&
            row.key.market === scope.market &&
            row.key.assetType === scope.assetType &&
            row.key.capability === capability &&
            row.enabled === true,
        )
      : undefined;
  const demands = (
    scope.market === 'CN' ? (['DAILY_TRADING_STATUS', 'DAILY_PRICE_RULE'] as const) : []
  ).flatMap((capability) => {
    if (!route(capability)?.targets.some((target) => target.eligible)) {
      diagnostics.push({ field: capability, status: 'unavailable', reason: 'control-rejected' });
      return [];
    }
    return [
      statusCompositionDemandV1Schema.parse({
        requirement: 'completeWindow',
        query: {
          contractVersion: 3,
          capabilityVersion: 1,
          consumer: 'thesis-ledger',
          requestId: randomUUID(),
          symbol: scope.symbol,
          range: { start: day, end: day },
          routeKey: { kind: 'data', market: scope.market, assetType: scope.assetType, capability },
          ...(capability === 'DAILY_PRICE_RULE' ? { representation: 'exactPrices' } : {}),
        },
      }),
    ];
  });
  const feeRoute = route('HISTORICAL_PUBLIC_FEES');
  const target = feeRoute?.targets.find((item) => item.eligible);
  const readFees = async () => {
    if (!feeRoute || !target) {
      diagnostics.push({
        field: 'HISTORICAL_PUBLIC_FEES',
        status: 'unavailable',
        reason: 'control-rejected',
      });
      return null;
    }
    const result = await dsa.marketPublicFeesV3({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: randomUUID(),
      symbol: scope.symbol,
      range: { start: day, end: day },
      routeKey: {
        kind: 'data',
        market: scope.market,
        assetType: scope.assetType,
        capability: 'HISTORICAL_PUBLIC_FEES',
      },
      routeTarget: {
        providerId: target.providerId,
        upstreamSource: target.upstreamSource,
        routeIndex: target.routeIndex,
      },
    });
    diagnostics.push({ field: 'HISTORICAL_PUBLIC_FEES', status: 'available' });
    return result;
  };
  const [statusRead, feeRead] = await Promise.allSettled([
    demands.length ? status.readComposition(demands) : Promise.resolve(null),
    readFees(),
  ]);
  let statuses: MarketStatusCompositionV1 | null = null;
  let fees: MarketPublicFeesResponseV3 | null = null;
  if (statusRead.status === 'fulfilled') statuses = statusRead.value;
  else
    diagnostics.push(
      ...demands.map((demand) =>
        failedLiveInput(demand.query.routeKey.capability, statusRead.reason),
      ),
    );
  if (feeRead.status === 'fulfilled') fees = feeRead.value;
  else diagnostics.push(failedLiveInput('HISTORICAL_PUBLIC_FEES', feeRead.reason));
  const after = (await dsa.effectiveControlPolicyV3()).projection?.effective;
  if (!sameStatusCompositionPolicyV1(policy, after)) {
    return {
      statuses: null,
      fees: null,
      diagnostics: diagnostics.map((item) => ({
        ...item,
        status: 'unavailable' as const,
        reason: 'stale-revision',
      })),
    };
  }
  return { statuses, fees, diagnostics };
}
