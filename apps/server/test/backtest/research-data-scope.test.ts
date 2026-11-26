import { expect, it } from 'vitest';
import { priceResearchFixture } from './price-research.fixtures.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { assertStrategyResearchScopeV3, assertResearchDataScopeV3, prepareResearchDataScopeV3 } from '../../src/backtest/backtest-research-data-scope-v3.js';

const prepare = (f: Awaited<ReturnType<typeof priceResearchFixture>>) => prepareBacktestRunConfigV3({
  request: f.request, strategy: f.input.strategy, control: f.control, reader: f.reader,
  checkedAt: '2026-06-07T08:00:00Z',
});
function priceOnly(f: Awaited<ReturnType<typeof priceResearchFixture>>) {
  f.input.strategy.sizing = { type: 'fixedAmount', amount: '1000' };
  f.input.strategy.signalSources = [{ id: 'execution', asset: f.input.strategy.executionInstrument,
    timeframe: '1d', priceCoordinate: 'research', series: ['close'] }];
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 2 } } };
}

it('金额价格研究只取得一次后复权，并冻结可用范围；引用范围外原价在创建前拒绝', async () => {
  const f = await priceResearchFixture();
  priceOnly(f);
  f.input.strategy.signalSources.push({ ...f.input.strategy.signalSources[0]!, id: 'unused-actual', priceCoordinate: 'actual' });
  const result = await prepare(f);
  expect(result.status, JSON.stringify(result)).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('未准备');
  expect(f.reader.readV3.mock.calls.map(([input]) => input.routeKey.adjustment)).toEqual(['hfq']);
  expect(result.runConfig.priceResearch?.dataScope).toMatchObject({
    version: 1, priceCoordinates: ['research'], sizingModes: ['fixedAmount', 'equityRatio'],
  });
  expect(() => assertStrategyResearchScopeV3(f.input.strategy, result.runConfig)).not.toThrow();
  f.input.strategy.sizing = { type: 'fixedQuantity', quantity: '10' };
  expect(() => assertStrategyResearchScopeV3(f.input.strategy, result.runConfig)).toThrow('sizing');
});

it('固定份数独立冻结两套价格，范围和份数资格来自已取得原价', async () => {
  const f = await priceResearchFixture();
  const result = await prepare(f);
  expect(result.status, JSON.stringify(result)).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('未准备');
  expect(f.reader.readV3.mock.calls.map(([input]) => input.routeKey.adjustment)).toEqual(['hfq', 'none']);
  expect(result.runConfig.priceResearch?.dataScope?.priceCoordinates).toEqual(['actual', 'research']);
  expect(result.runConfig.priceResearch?.dataScope?.sizingModes).toContain('fixedQuantity');
  expect(result.runConfig.priceResearch?.actualPriceWindow).toBeDefined();
});

it('必需价格窗口不足时说明具体规则和窗口，不因字段名称存在而通过', async () => {
  const f = await priceResearchFixture();
  priceOnly(f);
  const prepared = await prepare(f);
  if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 200 } },
    right: { type: 'series', sourceId: 'execution', field: 'close' } };
  const rows = new Map([['execution/bars.parquet', [{
    occurredAt: `${prepared.runConfig.startDate}T07:00:00Z`, availableAt: `${prepared.runConfig.startDate}T07:00:00Z`,
    open: '100', high: '110', low: '90', close: '100', volume: '10',
  }]]]);
  const result = prepareResearchDataScopeV3({ strategy: f.input.strategy, runConfig: prepared.runConfig, rows });
  expect(result.issues).toMatchObject([{ code: 'DATA_SCOPE_WARMUP', path: ['entry', 'left', 'input'] }]);
  expect(JSON.stringify(result.issues)).toContain('close');
});

it('旧冻结配置不新增范围校验，新范围对实际输入再核验', async () => {
  const f = await priceResearchFixture();
  priceOnly(f);
  const result = await prepare(f);
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const rows = new Map([['execution/bars.parquet', [
    { occurredAt: `${result.runConfig.startDate}T00:00:00Z`, availableAt: `${result.runConfig.startDate}T00:00:00Z`,
      open: '100', high: '110', low: '90', close: '100', volume: null },
  ]]]);
  const actual = prepareResearchDataScopeV3({ strategy: f.input.strategy, runConfig: result.runConfig, rows });
  expect(actual.scope.sources[0]!.fields).not.toContain('volume');
  expect(actual.issues).toMatchObject([{ code: 'DATA_SCOPE_WARMUP', path: ['entry', 'right', 'input'] }]);
  expect(result.runConfig.priceResearch?.dataScope?.sources[0]!.fieldWindows).not.toEqual(actual.scope.sources[0]!.fieldWindows);
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'volume' },
    right: { type: 'constant', value: '0' } };
  expect(() => assertResearchDataScopeV3({ strategy: f.input.strategy, runConfig: result.runConfig, rows })).toThrow('volume');
  const legacy = structuredClone(result.runConfig);
  delete legacy.priceResearch!.dataScope;
  expect(() => assertResearchDataScopeV3({ strategy: f.input.strategy, runConfig: legacy, rows })).not.toThrow();
});

it('六十条一分钟输入按正式日历聚合为一根小时能力，不开放二十根小时均线', async () => {
  const f = await priceResearchFixture();
  priceOnly(f);
  const prepared = await prepare(f);
  if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
  f.input.strategy.primaryTimeframe = '60m';
  f.input.strategy.signalSources[0]!.timeframe = '60m';
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 20 } } };
  const minuteRows = Array.from({ length: 60 }, (_, index) => ({
    symbol: f.input.strategy.executionInstrument.symbol, market: 'CN', timeframe: '1m',
    occurredAt: new Date(Date.parse('2026-05-18T01:30:00Z') + index * 60000).toISOString(),
    availableAt: new Date(Date.parse('2026-05-18T01:31:00Z') + index * 60000).toISOString(),
    open: '100', high: '110', low: '90', close: '100', volume: '10',
    providerId: 'fixture', quality: 'complete', completionStatus: 'complete', timestampConvention: 'interval-start',
  }));
  const calendarRows = [{ market: 'CN', timezone: 'Asia/Shanghai', provider: 'fixture', providerRevision: '1',
    availableAt: '2026-01-01T00:00:00Z', range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
    sessions: JSON.stringify([{ startMinute: 570, endMinute: 690 }, { startMinute: 780, endMinute: 900 }]),
    holidays: '[]', sessionOverrides: '[]' }];
  const result = prepareResearchDataScopeV3({ strategy: f.input.strategy, runConfig: prepared.runConfig,
    rows: new Map([['execution/bars.parquet', minuteRows]]), calendarRows });
  expect(result.scope.sources[0]).toMatchObject({ timeframe: '60m', observedRows: 1 });
  expect(result.issues).toMatchObject([{ code: 'DATA_SCOPE_WARMUP', path: ['entry', 'right', 'input'] }]);
  const unknownVolume = prepareResearchDataScopeV3({ strategy: f.input.strategy, runConfig: prepared.runConfig,
    rows: new Map([['execution/bars.parquet', minuteRows.map((row) => ({ ...row, volume: null }))]]), calendarRows });
  expect(unknownVolume.scope.sources[0]).toMatchObject({ timeframe: '60m', observedRows: 1 });
  expect(unknownVolume.scope.sources[0]?.fields).not.toContain('volume');
  expect(unknownVolume.issues).toMatchObject([{ code: 'DATA_SCOPE_WARMUP', path: ['entry', 'right', 'input'] }]);
});
