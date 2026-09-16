import { describe, expect, it } from 'vitest';
import {
  desiredProviderPolicyV2Schema,
  providerRouteMatrixV2Schema,
} from '../src/index.js';

const target = { providerId: 'akshare', upstreamSource: 'eastmoney' };

describe('Market Route Contract V2', () => {
  it('限制每条路由最多两个且不允许重复目标', () => {
    expect(
      providerRouteMatrixV2Schema.parse({
        DAILY_BAR: { ETF: [target, { providerId: 'tencent', upstreamSource: 'tencent' }] },
      }),
    ).toEqual({
      DAILY_BAR: { ETF: [target, { providerId: 'tencent', upstreamSource: 'tencent' }] },
    });
    expect(() =>
      providerRouteMatrixV2Schema.parse({ DAILY_BAR: { ETF: [target, target] } }),
    ).toThrow('RouteTarget 不能重复');
    expect(() =>
      providerRouteMatrixV2Schema.parse({
        DAILY_BAR: {
          ETF: [target, target, { providerId: 'tencent', upstreamSource: 'tencent' }],
        },
      }),
    ).toThrow();
  });

  it('要求 V2 policy 使用结构化 RouteTarget', () => {
    const policy = desiredProviderPolicyV2Schema.parse({
      contractVersion: 2,
      consumer: 'thesis-ledger',
      requestId: 'schema-test',
      revision: 3,
      enabled: true,
      routes: { DAILY_BAR: { ETF: [target] } },
    });
    expect(policy.routes.DAILY_BAR?.ETF?.[0]).toEqual(target);
    expect(() =>
      desiredProviderPolicyV2Schema.parse({
        ...policy,
        routes: { DAILY_BAR: { ETF: ['akshare'] } },
      }),
    ).toThrow();
  });

});
