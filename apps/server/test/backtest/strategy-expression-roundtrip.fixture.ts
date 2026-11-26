import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { priceResearchFixture } from './price-research.fixtures.js';
import { multitimeframeFixture } from './expression-multitimeframe.fixture.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
export type ExpressionRoundtripScenario = 'browser' | 'breakout' | 'equal' | 'multitimeframe';
export async function expressionRoundtripFixture(scenario: ExpressionRoundtripScenario) {
  const assetType = 'etf' as const;
  if (scenario === 'multitimeframe') {
    const f = await multitimeframeFixture();
    const research = await priceResearchFixture();
    const definition = f.input.strategy;
    return {
      definition,
      expectedDefinition: structuredClone(definition),
      f: { ...f, dsa: research.dsa, request: research.request, control: research.control },
    };
  }
  const directory = process.env.STRATEGY_DEFINITION_CAPTURE_DIR;
  if (!directory) throw new Error('需要浏览器实际提交的受控定义');
  const captures = ['desktop', 'mobile'].map(
    (platform) =>
      JSON.parse(readFileSync(resolve(directory, `${platform}-1440.json`), 'utf8')) as unknown,
  );
  expect(captures[1]).toEqual(captures[0]);
  const capture = strategySchema.parse(captures[0]) as BacktestStrategy;
  const definition = structuredClone(capture);
  if (scenario !== 'browser') {
    const source = { type: 'series' as const, sourceId: 'renamed', field: 'high' as const };
    definition.entry = {
      type: 'compare',
      operator: 'gt',
      left: { ...source, field: 'close' },
      right: {
        type: 'lag',
        periods: 1,
        input: { type: 'indicator', name: 'Highest', input: source, params: { period: 20 } },
      },
    };
  }
  const expectedDefinition = scenario === 'browser' ? captures[0] : definition;
  expect(definition.schemaVersion).toBe('3');
  expect(definition.executionInstrument.assetType).toBe(assetType);
  expect(definition.cost.commissionRate).toBe('0.000300000000000001');
  if (scenario === 'browser') expect(definition.entry.type).toBe('all');
  const f = await priceResearchFixture({
    assetType,
    researchSource: { providerId: 'futu', upstreamSource: 'futu' },
  });
  f.input.strategy = definition;
  const original = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (request) => {
    const result = await original(request);
    if (result.status !== 'selected') return result;
    if (scenario !== 'browser') {
      result.selection.response.bars = result.selection.response.bars.map((bar) => ({
        ...bar,
        open: 100,
        high: bar.timestamp.startsWith('2026-05-18') ? 110 : 100,
        low: 99,
        close: scenario === 'breakout' && bar.timestamp.startsWith('2026-05-18') ? 105 : 100,
      }));
    }
    const response = result.selection.response;
    response.sourcePriceBasis.volumeBasis = 'split-adjusted';
    const scale = request.routeKey.adjustment === 'none' ? 0.5 : 1;
    for (const bar of scenario === 'browser' ? response.bars : []) {
      const date = bar.timestamp.slice(0, 10);
      let price = 13;
      if (date < '2026-05-18') price = 8;
      if (date === '2026-05-18') price = 7;
      if (date === '2026-05-19') price = 12;
      bar.open = (date <= '2026-05-19' ? 8 : 12) * scale;
      bar.close = price * scale;
      bar.high = Math.max(bar.open, bar.close) + 0.1 * scale;
      bar.low = Math.min(bar.open, bar.close) - 0.1 * scale;
    }
    response.historicalTradabilityWindows = [
      tradabilityFixtureV3(tradabilityWindowFromResponseV3(response)),
    ];
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    return result;
  });

  return { definition, expectedDefinition, f };
}
