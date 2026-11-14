import { describe, expect, it } from 'vitest';
import {
  type MarketRouteCapabilityV3,
  type MarketRouteKeyV3,
  type RoutingAuthoring,
} from '@thesis-ledger/schemas';
import { compileRoutingConfig } from '../../src/market/market-routing-compiler.js';
import { inferRoutingConfig } from '../../src/market/market-routing-rules.js';

const key: MarketRouteKeyV3 = {
  kind: 'bar',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};
const other: MarketRouteKeyV3 = { ...key, adjustment: 'hfq' };
const entries = ['one', 'two', 'three', 'four', 'five'].map((providerId) => ({
  key,
  target: { providerId, upstreamSource: providerId },
  state: 'ready' as const,
}));
const config = (): RoutingAuthoring => ({
  version: 1,
  keys: [key],
  preserved: [],
  rules: [
    { scope: { category: 'market' }, providers: ['one', 'two'] },
    { scope: { category: 'market', market: 'CN' }, providers: ['two'] },
    { scope: { category: 'market', market: 'CN', assetType: 'STOCK' }, providers: ['three'] },
    {
      scope: { category: 'market', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR' },
      providers: ['four'],
    },
    {
      scope: {
        category: 'market',
        market: 'CN',
        assetType: 'STOCK',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
      providers: ['five'],
    },
  ],
});
describe('分级规则编译', () => {
  it('从大类到精确口径逐级覆盖，删除覆盖恢复继承', () => {
    const draft = config();
    for (const id of ['five', 'four', 'three', 'two', 'one']) {
      expect(compileRoutingConfig(draft, entries).routes[0]?.targets[0]?.providerId).toBe(id);
      draft.rules.pop();
    }
  });
  it('明确空配置阻止继承，父级修改保留子级', () => {
    const draft = config();
    draft.rules.at(-1)!.providers = [];
    draft.rules[0]!.providers = ['five'];
    expect(compileRoutingConfig(draft, entries).routes).toEqual([]);
    expect(draft.rules).toHaveLength(5);
  });
  it('主备按各自能力编译，无覆盖留空，无凭据与单源分别诊断', () => {
    const draft = config();
    draft.rules = [draft.rules[0]!];
    expect(compileRoutingConfig(draft, entries.slice(0, 1)).diagnostics[0]?.state).toBe(
      'single_source',
    );
    expect(compileRoutingConfig(draft, []).diagnostics[0]?.state).toBe('uncovered');
    expect(
      compileRoutingConfig(draft, [{ ...entries[0]!, state: 'credential_missing' }]).diagnostics[0]
        ?.state,
    ).toBe('unavailable');
  });
  it('同源多个精确绑定拒绝猜测，不补入第三来源', () => {
    const draft = config();
    draft.rules = [draft.rules[0]!];
    const ambiguous: MarketRouteCapabilityV3[] = [
      entries[0]!,
      { ...entries[0]!, target: { providerId: 'one', upstreamSource: 'another' } },
    ];
    expect(compileRoutingConfig(draft, ambiguous)).toMatchObject({
      routes: [],
      diagnostics: [{ state: 'ambiguous' }],
    });
  });
  it('旧配置归纳后保持精确绑定；新增目录不会自动纳入', () => {
    const routes = [
      { key, targets: [entries[0]!.target, entries[1]!.target], enabled: true },
      { key: other, targets: [entries[2]!.target], enabled: true },
    ];
    const draft = inferRoutingConfig({ enabled: true, routes }, [key, other]);
    const compiled = compileRoutingConfig(draft, entries);
    expect(compiled.routes).toEqual(routes);
    expect(
      compileRoutingConfig(draft, [...entries, { ...entries[0]!, key: { ...key, market: 'HK' } }])
        .routes,
    ).toEqual(routes);
  });
  it('旧停用项不复活，空项作为例外保留', () => {
    const draft = inferRoutingConfig(
      { enabled: false, routes: [{ key, targets: [entries[0]!.target], enabled: true }] },
      [key, other],
    );
    expect(compileRoutingConfig(draft, entries).routes).toEqual([]);
  });
  it('单独配置沿用相同主备时保留原精确绑定，不因细分产生歧义', () => {
    const routes = [{ key, targets: [entries[0]!.target], enabled: true }];
    const draft = inferRoutingConfig({ enabled: true, routes }, [key]);
    draft.rules.push({ scope: { category: 'market', market: 'CN' }, providers: ['one'] });
    expect(
      compileRoutingConfig(draft, [
        ...entries,
        { ...entries[0]!, target: { providerId: 'one', upstreamSource: 'alternative' } },
      ]).routes,
    ).toEqual(routes);
  });
});
