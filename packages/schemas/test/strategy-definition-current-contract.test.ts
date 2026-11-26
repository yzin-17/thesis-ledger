import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { strategySchema } from '../src/backtest-strategy.js';
import { strategyRiskVersionEligibility } from '../src/strategy-risk-eligibility.js';

const sample = () =>
  JSON.parse(readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'));

function current() {
  return strategySchema.parse(sample());
}

it('业务读取只接受具名定义并保留原数值精度', () => {
  expect(strategySchema.safeParse({ ...sample(), schemaVersion: '2' }).success).toBe(false);
  const value = { ...current(), sizing: { type: 'fixedAmount', amount: '100.000000000000000001' } };
  expect(strategySchema.parse(value).sizing).toEqual(value.sizing);
});

it('基金和场内策略校验各自价格坐标', () => {
  const exchange = current();
  expect(strategySchema.safeParse({
    ...exchange,
    signalSources: exchange.signalSources.map((source) => ({ ...source, priceCoordinate: 'native-nav' })),
  }).success).toBe(false);

  const asset = { symbol: '110011.OF', market: 'CN', assetType: 'fund' };
  const nav = {
    ...exchange,
    signalSources: [{ id: 'primary', asset, timeframe: '1d', series: ['nav'], priceCoordinate: 'native-nav' }],
    executionInstrument: asset,
    entry: {
      type: 'compare', operator: 'gt',
      left: { type: 'series', sourceId: 'primary', field: 'nav' },
      right: { type: 'constant', value: '1' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
  };
  expect(strategySchema.safeParse(nav).success).toBe(true);
  expect(strategySchema.safeParse({
    ...nav,
    signalSources: nav.signalSources.map((source) => ({ ...source, priceCoordinate: 'research' })),
  }).success).toBe(false);
});

it('风险应用须使用现行已发布定义并具备可转换风险规则', () => {
  const schema = current();
  const version = { version: 1, schemaVersion: 1, schema };
  expect(strategyRiskVersionEligibility(version).eligible).toBe(true);
  expect(strategyRiskVersionEligibility({ ...version, version: 0 }).eligible).toBe(false);
  expect(strategyRiskVersionEligibility({ ...version, schemaVersion: 2 }).eligible).toBe(false);
  expect(strategyRiskVersionEligibility({
    ...version, schema: { ...schema, risk: [{ type: 'fixedStop', price: '100' }] },
  }).eligible).toBe(false);
});
