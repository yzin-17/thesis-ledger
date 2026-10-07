import { describe, expect, it } from 'vitest';
import {
  buildMarketPolicyPayload,
  decodeMarketPolicyRoutes,
  encodeMarketPolicyRoutes,
  marketPolicyResponse,
  removeProviderTargets,
} from '../../src/market/market-policy-storage.js';

const routes = [
  {
    key: {
      kind: 'bar' as const,
      market: 'CN' as const,
      assetType: 'ETF' as const,
      capability: 'DAILY_BAR' as const,
      timeframe: '1d' as const,
      adjustment: 'qfq' as const,
    },
    targets: [
      { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
      { providerId: 'akshare', upstreamSource: 'eastmoney' },
    ],
  },
];

describe('market policy JSON storage', () => {
  it('只存储当前精确路由，读取拒绝旧矩阵和旧包装', () => {
    const stored = encodeMarketPolicyRoutes(routes);
    expect(stored).toEqual({ storageVersion: 3, routes });
    expect(decodeMarketPolicyRoutes(stored)).toEqual(routes);
    expect(() => decodeMarketPolicyRoutes({ DAILY_BAR: { ETF: [] } })).toThrow();
    expect(() => decodeMarketPolicyRoutes({ ...stored, legacyV2Routes: {} })).toThrow();
    expect(() => decodeMarketPolicyRoutes({ ...stored, routes: { DAILY_BAR: {} } })).toThrow();
  });

  it('构建当前合同需要明确版本和精确路由', () => {
    expect(
      buildMarketPolicyPayload({ contractVersion: 3, enabled: true, routes }, 7),
    ).toMatchObject({
      contractVersion: 3,
      revision: 7,
      routes,
    });
    expect(() => buildMarketPolicyPayload({ enabled: true, routes }, 7)).toThrow();
  });

  it('从所有精确路由中移除同一 Provider 的目标', () => {
    const { nextRoutes, routeDiff } = removeProviderTargets(routes, 'HITHINK');
    expect(nextRoutes[0]?.targets).toEqual([
      { providerId: 'akshare', upstreamSource: 'eastmoney' },
    ]);
    expect(routeDiff[0]?.key).toEqual(routes[0]?.key);
  });

  it('响应只暴露当前合同，并核对生效修订', () => {
    const row = {
      consumer: 'thesis-ledger',
      revision: 9,
      enabled: true,
      routes: encodeMarketPolicyRoutes(routes),
      syncState: 'applied',
      effectiveProjection: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'current-policy',
        revision: 9,
        sourceDesiredRevision: 9,
        enabled: true,
        routes: routes.map((route) => ({
          ...route,
          reason: null,
          targets: route.targets.map((target, routeIndex) => ({
            ...target,
            routeIndex,
            eligible: true,
            reason: null,
          })),
        })),
        appliedAt: '2026-09-25T04:00:00Z',
      },
    };
    expect(marketPolicyResponse(row)).toMatchObject({
      contractVersion: 3,
      revision: 9,
      routes,
      effectiveStale: false,
    });
    expect(marketPolicyResponse({ ...row, revision: 10 }).effectiveStale).toBe(true);
    for (const projection of [
      { ...row.effectiveProjection, contractVersion: 2 },
      { contractVersion: 3, sourceDesiredRevision: 9 },
    ]) {
      expect(() => marketPolicyResponse({ ...row, effectiveProjection: projection })).toThrow(
        'Policy Effective 存储格式不是当前版本',
      );
    }
    expect(
      marketPolicyResponse({
        ...row,
        effectiveProjection: { ...row.effectiveProjection, routes: [] },
      }).effectiveStale,
    ).toBe(true);
  });
});
