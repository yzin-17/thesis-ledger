import { expect, it } from 'vitest';
import { buildResearchDataScope, type BacktestSeries } from '@thesis-ledger/domain';
import { backtestResearchDataScopeSchema } from '../src/backtest-research-data-scope.js';
import { backtestPriceResearchSchema } from '../src/backtest-price-research.js';

const asset = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } as const;
function scope() {
  const sources = (['close', 'open'] as const).map((field): BacktestSeries => ({
    sourceId: 'main', symbol: asset.symbol, market: asset.market, assetType: asset.assetType,
    timeframe: '1d', field, adjusted: true,
    points: [1, 2].map((day) => ({ occurredAt: `2026-01-0${day}T07:00:00Z`,
      availableAt: `2026-01-0${day}T07:00:00Z`, value: '100', status: 'available' })),
  }));
  return buildResearchDataScope({ executionInstrument: asset, primaryTimeframe: '1d',
    sources: [{ sourceId: 'main', coordinate: 'research', timeframe: '1d', series: sources,
      analysisStartAt: '2026-01-03T00:00:00Z', volumeBasis: 'unknown' }],
  });
}

it('正式合同读取纯函数产物，字段／窗口与单输入仓位能力保持原样', () => {
  const value = scope();
  expect(backtestResearchDataScopeSchema.parse(value)).toEqual(value);
  expect(value.sizingModes).toEqual(['fixedAmount', 'equityRatio']);
  expect(value.priceCoordinates).toEqual(['research']);
});
it('有字段名称但无有效值、虚报长窗与额外字段均拒绝', () => {
  const value = scope();
  value.sources[0]!.fields.push('volume');
  expect(backtestResearchDataScopeSchema.safeParse(value).success).toBe(false);
  const tooLong = scope();
  tooLong.sources[0]!.fieldWindows[0]!.longestWindowRows = 20;
  expect(backtestResearchDataScopeSchema.safeParse(tooLong).success).toBe(false);
  expect(backtestResearchDataScopeSchema.safeParse({ ...scope(), additionalSource: asset }).success).toBe(false);
});
it('旧研究配置不补能力范围，不改变缺省解码与历史摘要输入', () => {
  const old = { protocolVersion: 'price-research-v1' };
  expect(backtestPriceResearchSchema.parse(old)).toEqual(old);
});
