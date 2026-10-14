import {
  tradingStatusArtifactKeyV3,
  statusCompositionArtifactKeyV1,
  type BacktestSnapshotManifestV3,
  type RunConfigV3,
  type BacktestTradingStatusDisclosureV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { readSnapshotTradingStatusV3 } from './backtest-trading-status-snapshot-v3.js';
import { intradayStatusInterpretationV3 } from './backtest-intraday-status-v3.js';
import {
  basicLifecycleForbidsTradeV3,
  basicLifecycleWarningsV3,
} from './backtest-basic-lifecycle-v3.js';
import { lifecycleBenchmarkSkippedDatesV3 } from './backtest-lifecycle-execution-v3.js';
import { listingForbidsExchangeTrade } from './backtest-listing-status-v3.js';
import { readSnapshotStatusCompositionV1, statusCompositionWarningsV1 } from './backtest-status-composition-v1.js';

/** 冻结价格保持原样；只有执行视图附加当日停牌约束，策略不读取状态表。 */
export const prepareTradingStatusExecutionV3 = (
  manifest: BacktestSnapshotManifestV3,
  runConfig: RunConfigV3,
  rows: ReadonlyMap<string, readonly ArtifactRow[]>,
) => {
  const composition = readSnapshotStatusCompositionV1(manifest, runConfig, rows.get(`${manifest.runId}/${statusCompositionArtifactKeyV1}`) ?? []);
  const compositionWarnings = statusCompositionWarningsV1(composition);
  let status = readSnapshotTradingStatusV3(
    {
      runId: manifest.runId,
      ...(manifest.tradingStatus ? { tradingStatus: manifest.tradingStatus } : {}),
    },
    runConfig,
    rows.get(`${manifest.runId}/${tradingStatusArtifactKeyV3}`) ?? [],
  );
  const interpretation =
    status?.disclosure.status === 'source'
      ? intradayStatusInterpretationV3(runConfig, status.disclosure.response, rows)
      : undefined;
  if (interpretation && status?.disclosure.status === 'source')
    status = {
      ...status,
      disclosure: { ...status.disclosure, executionInterpretation: interpretation },
    };
  const suspendedDates =
    status?.disclosure.status === 'source'
      ? status.disclosure.response.days
          .filter(
            (day) =>
              day.state === 'suspended' ||
              listingForbidsExchangeTrade(day) ||
              basicLifecycleForbidsTradeV3(
                day.date,
                status?.disclosure.status === 'source'
                  ? status.disclosure.response.basicLifecycle
                  : undefined,
              ),
          )
          .map((day) => day.date)
      : [...(composition?.adoption.suspendedDates ?? [])];
  suspendedDates.push(...(interpretation?.excludedDates ?? []));
  const benchmarkSkippedDates = [...new Set([...suspendedDates, ...lifecycleBenchmarkSkippedDatesV3(runConfig)])];
  if (!suspendedDates.length && !benchmarkSkippedDates.length)
    return { status, compositionWarnings, suspendedDates, benchmarkSkippedDates, executionRows: rows, benchmarkRows: rows };
  const suspended = new Set(suspendedDates);
  const key = `${manifest.runId}/execution/bars.parquet`;
  const executionBars = rows.get(key) ?? [];
  const isSuspended = (row: ArtifactRow) =>
    typeof row.occurredAt === 'string' && suspended.has(row.occurredAt.slice(0, 10));
  const executionRows = new Map(rows);
  executionRows.set(
    key,
    executionBars.map((row) => (isSuspended(row) ? { ...row, suspended: true } : row)),
  );
  const benchmarkRows = new Map(rows);
  benchmarkRows.set(
    key,
    executionBars.filter((row) => typeof row.occurredAt === 'string' && !benchmarkSkippedDates.includes(row.occurredAt.slice(0,10))),
  );
  return { status, compositionWarnings, suspendedDates, benchmarkSkippedDates, executionRows, benchmarkRows };
};

export const tradingStatusWarningsV3 = (
  disclosure?: BacktestTradingStatusDisclosureV3,
): string[] => {
  if (!disclosure) return [];
  if (disclosure.status === 'notIncluded') return [disclosure.reason];
  if (disclosure.response.sourceRecords) {
    const coverage = disclosure.response.structuredCoverage!;
    const timing = disclosure.structuredResearch?.observedAfterPriceCutoff
      ? '状态实际获取晚于价格截点，时钟已分别冻结。'
      : '状态实际观察时钟已冻结。';
    return [
      ...basicLifecycleWarningsV3(disclosure),
      `已使用冻结结构化日级状态；交易状态缺失 ${coverage.statusUnknownDates.length} 日，日历未知 ${coverage.calendarUnknownDates.length} 日，ST 标记缺失 ${coverage.stUnknownDates.length} 日；粗 ST 不推导细分风险或精确价格限制。${timing}未知维度沿用已选研究假设，历史首次可见时钟未验证。`,
    ];
  }
  if (disclosure.response.days.some((day) => day.listingPhase))
    return [
      '上市阶段已使用冻结公告；未上市或已摘牌日禁止交易所成交，缺失行情未补造，末次价格不代表摘牌后可变现价值；历史首次可见时钟未验证。',
    ];
  return ['停复牌已使用冻结公告；未披露日期保持未知，历史首次可见时钟未验证。'];
};
