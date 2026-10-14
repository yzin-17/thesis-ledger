import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  runConfigSchemaV3, marketTradingStatusResponseV3Schema, backtestTradingStatusSnapshotV3Schema,
  type BacktestSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import { statusPriceExecutionModelV3 } from '../../src/backtest/backtest-status-price-model-v3.js';
import { extendedStatusFreezeVersion } from '../../src/backtest/backtest-listing-status-v3.js';
import { prepareTradingStatusExecutionV3 } from '../../src/backtest/backtest-trading-status-execution-v3.js';
import { tradingStatusArtifactRowsV3 } from '../../src/backtest/backtest-trading-status-snapshot-v3.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';

const fixture = (name: string) => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));

function inputs() {
  // 受控合同测试：沿用已有窗口，不作为真实上市来源验收。
  const response = marketTradingStatusResponseV3Schema.parse(fixture('market-risk-price-limits-v3.response.json').response);
  const model = fixture('backtest-execution-model.cn-2024q1.json');
  model.scope.symbol = response.symbol;
  model.scope.range = response.range;
  for (const segment of model.segments) segment.range = response.range;
  const protocol = fixture('execution-price.raw-events.json');
  protocol.history = { basis: 'fixed-provider-snapshot' };
  protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  const config = runConfigSchemaV3.parse({ schemaVersion: '3', startDate: response.range.start,
    endDate: response.range.end, dataAsOf: '2026-10-08T00:00:00Z', baseCurrency: 'CNY',
    initialCash: { CNY: '100000' }, valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' }, executionModel: model, executionPriceProtocol: protocol });
  return { response, config };
}

describe('上市阶段冻结与执行', () => {
  it('明确无日限制覆盖已选日限制，之后比例限制继续独立生效', () => {
    const { response, config } = inputs();
    const day = response.days[0]!;
    delete day.dailyPriceLimit;
    day.listingPhase = 'initialListing';
    day.noDailyPriceLimit = { reason: '受控首日无日限制' };
    const result = statusPriceExecutionModelV3(config, response)!;
    expect(result.segments[0]!.execution.mode).toBe('exchange');
    expect(result.segments[0]!.execution).toMatchObject({ price: { kind: 'noDailyLimit', reason: '受控首日无日限制' } });
    expect(result.segments[1]!.execution).toMatchObject({ price: { kind: 'dailyLimit' } });
  });
  it('只有阶段的来源同样核对摘要与冻结时钟', () => {
    const { response, config } = inputs();
    for (const day of response.days) delete day.dailyPriceLimit;
    response.days[0]!.listingPhase = 'delisted';
    response.sourceDocuments[0]!.observedAt = '2026-10-09T00:00:00Z';
    expect(() => statusPriceExecutionModelV3(config, response)).toThrow('核验时钟');
  });
  it('阶段产物拒绝回填旧v1/v2冻结身份', () => {
    const { response, config } = inputs();
    response.days[0]!.listingPhase = 'initialListing';
    expect(extendedStatusFreezeVersion(response)).toEqual({ freezeVersion: 'frozen-trading-status-v3' });
    for (const freezeVersion of ['frozen-trading-status-v1', 'frozen-trading-status-v2'])
      expect(backtestTradingStatusSnapshotV3Schema.safeParse({ freezeVersion,
        runConfigChecksum: hashCanonicalManifest(config), disclosure: { status: 'source', response } }).success).toBe(false);
  });
  it('执行视图禁止未上市/摘牌成交，整理期仍可交易，原价产物不回写', () => {
    const { response, config } = inputs();
    for (const day of response.days) { delete day.dailyPriceLimit; delete day.riskWarning; day.state = 'unknown'; }
    response.days[0]!.listingPhase = 'notListed';
    response.days[1]!.listingPhase = 'delistingPeriod';
    response.days[2]!.listingPhase = 'delisted';
    for (const day of response.days.slice(3)) delete day.sourceDocumentIds;
    const status = backtestTradingStatusSnapshotV3Schema.parse({ ...extendedStatusFreezeVersion(response),
      runConfigChecksum: hashCanonicalManifest(config), disclosure: { status: 'source', response } });
    const runId = 'listing-execution';
    const barKey = `${runId}/execution/bars.parquet`;
    const bars: ArtifactRow[] = response.days.slice(0, 3).map((day) => ({ occurredAt: `${day.date}T00:00:00+08:00`, close: '10' }));
    const rows = new Map([[barKey, bars], [`${runId}/metadata/trading-status-v3.parquet`, tradingStatusArtifactRowsV3(status)]]);
    const manifest = { runId, tradingStatus: { ...extendedStatusFreezeVersion(response),
      artifactKey: `${runId}/metadata/trading-status-v3.parquet` } } as BacktestSnapshotManifestV3;
    const result = prepareTradingStatusExecutionV3(manifest, config, rows);
    expect(result.executionRows.get(barKey)?.map((row) => row.suspended === true)).toEqual([true, false, true]);
    expect(result.benchmarkRows.get(barKey)).toEqual([bars[1]]);
    expect(bars.every((row) => row.suspended === undefined)).toBe(true);
    expect(response.days[2]!.state).toBe('unknown');
  });
});
