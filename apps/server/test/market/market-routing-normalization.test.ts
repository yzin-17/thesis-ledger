import { describe, expect, it } from 'vitest';
import {
  isExactRoutingScope,
  routingAuthoringSchema,
  type MarketRouteCapabilityV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import {
  compileRoutingConfig,
  preserveCompiledBindings,
} from '../../src/market/market-routing-compiler.js';
import { normalizeRoutingInheritance } from '../../src/market/market-routing-normalization.js';
import { exactRoutingScope, inferRoutingConfig } from '../../src/market/market-routing-rules.js';

const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'MINUTE_BAR',
  timeframe: '1m',
  adjustment: 'none',
} as const;
const other = { ...key, timeframe: '5m' } as const;
const third = { ...key, timeframe: '15m' } as const;
const purpose = {
  category: 'market',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'MINUTE_BAR',
} as const;
const target = { providerId: 'akshare', upstreamSource: 'sina' };
const catalog: MarketRouteCapabilityV3[] = [key, other, third].flatMap((key) => [
  { key, target, state: 'ready' },
  { key, target: { ...target, upstreamSource: 'eastmoney' }, state: 'ready' },
]);
function fixture(): RoutingAuthoring {
  const config: RoutingAuthoring = {
    version: 1,
    keys: [key, other, third],
    preserved: [],
    rules: [
      { scope: { category: 'market' }, providers: ['futu'] },
      { scope: { category: 'market', market: 'CN' }, providers: ['akshare'] },
      { scope: purpose, providers: ['akshare'], upstreamSources: { akshare: 'sina' } },
      { scope: { ...purpose, timeframe: '5m' }, providers: [] },
      {
        scope: exactRoutingScope(third),
        providers: ['akshare'],
        upstreamSources: { akshare: 'eastmoney' },
      },
    ],
  };
  return preserveCompiledBindings(config, compileRoutingConfig(config, catalog).routes);
}

describe('旧汇总继承无损整理', () => {
  it('展开获胜规则并保留显式空项及精确例外；整理前后来源等价、输入不变且幂等', () => {
    const original = fixture(),
      before = structuredClone(original);
    const result = normalizeRoutingInheritance(original);
    expect(result.legacyRuleCount).toBe(3);
    expect(
      result.config.rules.every((rule) => !rule.scope.market || isExactRoutingScope(rule.scope)),
    ).toBe(true);
    expect(result.config.rules.find((rule) => rule.scope.timeframe === '5m')?.providers).toEqual(
      [],
    );
    expect(
      result.config.rules.find((rule) => rule.scope.timeframe === '15m')?.upstreamSources,
    ).toEqual({ akshare: 'eastmoney' });
    expect(compileRoutingConfig(result.config, catalog).routes).toEqual(
      compileRoutingConfig(original, catalog).routes,
    );
    expect(result.config.preserved.every((item) => isExactRoutingScope(item.rule.scope))).toBe(
      true,
    );
    expect(original).toEqual(before);
    expect(normalizeRoutingInheritance(result.config)).toEqual({
      config: result.config,
      legacyRuleCount: 0,
    });
    expect(routingAuthoringSchema.safeParse(result.config).success).toBe(true);
  });

  it('原精确绑定即使不可用或同源多接口仍保持，不按目录重选来源', () => {
    const original = fixture();
    const unavailable = catalog.map((entry) => ({
      ...entry,
      state: 'credential_missing' as const,
    }));
    const next = normalizeRoutingInheritance(original).config;
    expect(compileRoutingConfig(next, unavailable).routes).toEqual(
      compileRoutingConfig(original, unavailable).routes,
    );
    expect(compileRoutingConfig(next, catalog).routes[0]?.targets).toEqual([target]);
    expect(next.keys).toEqual(original.keys);
  });

  it('上级变化保留已展开的例外，删除单项后直接继承大类；新能力不沿用已移除的旧汇总规则', () => {
    const next = normalizeRoutingInheritance(fixture()).config;
    next.rules[0] = {
      scope: { category: 'market' },
      providers: ['akshare'],
      upstreamSources: undefined,
    };
    expect(compileRoutingConfig(next, catalog).routes[0]?.targets).toEqual([target]);
    next.rules = next.rules.filter((rule) => rule.scope.timeframe !== '1m');
    expect(compileRoutingConfig(next, catalog).diagnostics[0]?.inheritedFrom).toEqual({
      category: 'market',
    });
    const newKey = { ...key, timeframe: '30m' } as const;
    expect(
      compileRoutingConfig(next, [...catalog, { key: newKey, target, state: 'ready' }]).routes.some(
        (route) => route.key.kind === 'bar' && route.key.timeframe === '30m',
      ),
    ).toBe(false);
  });

  it('无元数据的旧策略归纳后同样展开，未配置项保持为空，未生效保留绑定不被激活', () => {
    const inferred = inferRoutingConfig(
      { enabled: true, routes: [{ key, targets: [target], enabled: true }] },
      [key, other, third],
    );
    const next = normalizeRoutingInheritance(inferred).config;
    expect(compileRoutingConfig(next, catalog).routes).toEqual(
      compileRoutingConfig(inferred, catalog).routes,
    );
    const draft = fixture();
    draft.rules.at(-1)!.providers = [];
    delete draft.rules.at(-1)!.upstreamSources;
    expect(compileRoutingConfig(normalizeRoutingInheritance(draft).config, catalog).routes).toEqual(
      compileRoutingConfig(draft, catalog).routes,
    );
  });
});
