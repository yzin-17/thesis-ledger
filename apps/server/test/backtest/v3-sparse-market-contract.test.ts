import { describe, expect, it } from 'vitest';
import {
  marketDataBarSeriesRequestResponseV3Schema,
  marketDataBarSeriesResponseV3Schema,
  marketDataMultiWindowResponseV3Schema,
  sliceTradabilityWindowsV3,
} from '@thesis-ledger/schemas';
import { buildInput, makeReaderResult } from './v3-snapshot-fixtures.js';
import { makeMultiWindowResponseV3 } from './v3-multi-window-fixtures.js';

async function sample() {
  const { input } = await buildInput();
  const result = await makeReaderResult(
    {
      market: 'CN',
      symbol: input.strategy.executionInstrument.symbol,
      routeKey: {
        kind: 'bar',
        market: 'CN',
        assetType: 'ETF',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
      window: { start: '2026-05-11', end: '2026-05-20' },
      tradabilityMode: 'assume-untradable-no-bar',
    },
    false,
    ['2026-05-19'],
  );
  if (result.status !== 'selected') throw new Error('样本未选中');
  return { request: result.request, response: result.selection.response };
}

describe('缺 Bar 行情合同', () => {
  it('显式模式接受完整状态分区，普通请求拒绝稀疏响应', async () => {
    const pair = await sample();
    expect(marketDataBarSeriesRequestResponseV3Schema.safeParse(pair).success).toBe(true);
    delete pair.request.tradabilityMode;
    expect(marketDataBarSeriesRequestResponseV3Schema.safeParse(pair).success).toBe(false);
    delete pair.response.historicalTradabilityWindows;
    expect(marketDataBarSeriesResponseV3Schema.safeParse(pair.response).success).toBe(false);
  });
  it('遗漏状态、状态与 Bar 矛盾和零量 Bar 均拒绝', async () => {
    const { response } = await sample();
    const missing = structuredClone(response);
    missing.historicalTradabilityWindows![0]!.days.pop();
    expect(marketDataBarSeriesResponseV3Schema.safeParse(missing).success).toBe(false);
    const phantom = structuredClone(response);
    phantom.historicalTradabilityWindows![0]!.days.at(-2)!.state = 'observed-traded';
    expect(marketDataBarSeriesResponseV3Schema.safeParse(phantom).success).toBe(false);
    response.bars[0]!.volume = 0;
    expect(marketDataBarSeriesResponseV3Schema.safeParse(response).success).toBe(false);
  });
  it('多窗口保留每窗原摘要，拒绝父子证据不一致', async () => {
    const { response } = await sample();
    const multi = makeMultiWindowResponseV3(response);
    expect(marketDataMultiWindowResponseV3Schema.safeParse(multi).success).toBe(true);
    const clipped = sliceTradabilityWindowsV3(response.historicalTradabilityWindows!, {
      start: '2026-05-18',
      end: '2026-05-20',
    });
    expect(clipped[0]!.barSource.responseSha256).toBe(
      response.historicalTradabilityWindows![0]!.barSource.responseSha256,
    );
    expect(clipped[0]!.days).toHaveLength(3);
    multi.historicalTradabilityWindows = structuredClone(multi.historicalTradabilityWindows!);
    multi.historicalTradabilityWindows[0]!.barSource.responseSha256 = 'b'.repeat(64);
    expect(marketDataMultiWindowResponseV3Schema.safeParse(multi).success).toBe(false);
  });
});
