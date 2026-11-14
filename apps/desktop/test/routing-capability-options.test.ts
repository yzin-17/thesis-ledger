import { describe, expect, it } from 'vitest';
import type { MarketRouteCapabilityV3, RoutingAuthoring } from '@thesis-ledger/schemas';
import {
  routingSourceChoices,
  routingSourceValue,
  updateRoutingSourceChoice,
} from '../src/features/market-data/routing-source-choices.js';
import { key, provider } from './market-policy-defaults.fixture.js';

const scope = {
  category: 'market',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
const target = { providerId: 'hithink', upstreamSource: 'history' };
const entry: MarketRouteCapabilityV3 = { key, target, state: 'ready' };
const providers = [provider, { ...provider, providerId: 'unrelated', displayName: '其他数据源' }];

describe('当前能力的路由选项', () => {
  it('逐一匹配市场、标的类型、用途、周期、复权，排除目录外提供方和其他具体来源', () => {
    const mismatches: MarketRouteCapabilityV3[] = [
      { ...entry, key: { ...key, market: 'HK' } },
      { ...entry, key: { ...key, assetType: 'STOCK' } },
      { ...entry, key: { ...key, capability: 'MINUTE_BAR', timeframe: '1m' } },
      { ...entry, key: { ...key, adjustment: 'none' } },
      {
        ...entry,
        key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'REALTIME_QUOTE' },
      },
    ].map((item) => ({ ...item, target: { ...target, upstreamSource: 'other' } }));
    const options = routingSourceChoices(providers, [entry, ...mismatches], scope);
    expect(options.map((item) => item.upstreamSource)).toEqual(['history']);
    expect(options.map((item) => item.providerId)).toEqual(['hithink']);
    expect(routingSourceChoices(providers, mismatches, scope)).toEqual([]);
    const minute = { ...key, capability: 'MINUTE_BAR', timeframe: '1m' } as const;
    const periods: MarketRouteCapabilityV3[] = [
      { ...entry, key: minute },
      {
        ...entry,
        key: { ...minute, timeframe: '5m' },
        target: { ...target, upstreamSource: 'other-period' },
      },
    ];
    expect(
      routingSourceChoices(providers, periods, {
        ...scope,
        capability: 'MINUTE_BAR',
        timeframe: '1m',
      }).map((item) => item.upstreamSource),
    ).toEqual(['history']);
  });

  it('不支持的能力不展示，缺少凭据的适配来源标明原因且不能修改草稿', () => {
    expect(routingSourceChoices(providers, [{ ...entry, state: 'not_adapted' }], scope)).toEqual(
      [],
    );
    const options = routingSourceChoices(
      [{ ...provider, credentialConfigured: false }],
      [entry],
      scope,
    );
    expect(options[0]?.label).toContain('凭据缺失');
    expect(options[0]?.disabled).toBe(true);
    const config: RoutingAuthoring = { version: 1, keys: [key], rules: [], preserved: [] };
    expect(updateRoutingSourceChoice(config, scope, 0, options[0]!)).toBe(config);
  });

  it('账号权限必须经原有规则确认；缺少报告、等级不包含、配置过期均排除', () => {
    const checked = { ...provider, accountAccessSupported: true, configVersion: 7 };
    const access = {
      state: 'allowed',
      checkedAt: '2026-11-09T00:00:00Z',
      persisted: true,
      configVersion: 7,
    } as const;
    expect(routingSourceChoices([checked], [entry], scope)).toEqual([]);
    expect(
      routingSourceChoices([checked], [{ ...entry, accountAccess: access }], scope),
    ).toHaveLength(1);
    expect(
      routingSourceChoices(
        [checked],
        [{ ...entry, accountAccess: { ...access, state: 'not_included' } }],
        scope,
      ),
    ).toEqual([]);
    expect(
      routingSourceChoices(
        [checked],
        [{ ...entry, accountAccess: { ...access, configVersion: 6 } }],
        scope,
      ),
    ).toEqual([]);
  });

  it('聚合范围保留部分覆盖；仅有既有不适用选择时可回显和清空，不写回读取结果', () => {
    const rule = { scope, providers: ['unrelated'], upstreamSources: { unrelated: 'old' } };
    const before = structuredClone(rule);
    const options = routingSourceChoices(providers, [entry], scope, rule);
    const selected = options.find(
      (item) => item.value === routingSourceValue(rule, 'unrelated', options),
    );
    expect(selected?.label).toContain('不支持当前能力');
    expect(selected?.disabled).toBe(true);
    expect(rule).toEqual(before);
    const config: RoutingAuthoring = { version: 1, keys: [key], rules: [rule], preserved: [] };
    expect(updateRoutingSourceChoice(config, scope, 0, null).rules.at(-1)?.providers).toEqual([]);
    const aggregate = routingSourceChoices(providers, [entry], { category: 'market' });
    expect(aggregate.map((item) => item.providerId)).toEqual(['hithink']);
  });
});
