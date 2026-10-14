import { tradingCalendarFromFact } from '@thesis-ledger/domain';
import {
  tradingCalendarFactSchema,
  compareMarketPitEvidenceInstantStringsV1,
  type MarketTradingStatusResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { dailyBarSessionIntervals } from './backtest-daily-bar-session.js';

/** 核对来源身份及当前观察时钟；不赋予历史首次可见资格。 */
export function validateIntradayStatusV3(
  config: RunConfigV3,
  response: MarketTradingStatusResponseV3,
) {
  if (!response.days.some((day) => day.intradayHalts)) return;
  if (
    response.symbol !== config.executionModel?.scope.symbol ||
    response.routeKey.market !== config.executionModel.scope.market ||
    response.range.start !== config.startDate ||
    response.range.end !== config.endDate ||
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot'
  )
    throw new Error('盘中状态与固定研究标的/窗口不一致');
  for (const day of response.days) {
    if (!day.intradayHalts) continue;
    for (const id of day.sourceDocumentIds ?? []) {
      const doc = response.sourceDocuments.find((item) => item.id === id);
      const order = doc?.observedAt
        ? compareMarketPitEvidenceInstantStringsV1(doc.observedAt, config.dataAsOf)
        : undefined;
      if (!doc?.sha256 || order === undefined || order > 0)
        throw new Error('盘中状态缺少截点前实际原件摘要/观察时钟');
    }
  }
}

/** 按冻结会话求交；次日开市前恢复不排除恢复日。 */
export function intradayStatusInterpretationV3(
  config: RunConfigV3,
  response: MarketTradingStatusResponseV3,
  rows: ReadonlyMap<string, readonly ArtifactRow[]>,
) {
  validateIntradayStatusV3(config, response);
  if (!response.days.some((day) => day.intradayHalts)) return undefined;
  const selected = config.executionModel?.segments.some(
    (segment) =>
      segment.execution.mode === 'exchange' &&
      segment.execution.statusPolicy?.intradayHalt === 'exclude-known-halt-date-v1',
  );
  if (!selected)
    return {
      policy: 'not-modeled' as const,
      excludedDates: [],
      reason: '盘中暂停仅披露来源事实；已选日线模型未建模盘中约束。',
    };
  const fact = [...rows]
    .find(([key]) => key.split('/').at(-2) === 'calendar')?.[1]
    .find((row) => row.market === response.routeKey.market);
  if (!fact) throw new Error('盘中状态缺少同一市场冻结日历');
  const parsed: Record<string, unknown> = { ...fact };
  for (const key of ['sessions', 'sessionOverrides', 'holidays', 'range']) {
    if (typeof fact[key] !== 'string') throw new Error('盘中状态冻结日历结构缺失');
    parsed[key] = JSON.parse(fact[key]) as unknown;
  }
  const calendar = tradingCalendarFromFact(tradingCalendarFactSchema.parse(parsed));
  if (calendar.timezone !== response.provenance.timezone)
    throw new Error('盘中状态来源与冻结会话时区不一致');
  const halts = response.days.flatMap((day) => day.intradayHalts ?? []);
  const excludedDates = response.days
    .filter((day) => {
      const segment = config.executionModel?.segments.find(
        (item) => item.range.start <= day.date && item.range.end >= day.date,
      );
      if (
        segment?.execution.mode !== 'exchange' ||
        segment.execution.statusPolicy?.intradayHalt !== 'exclude-known-halt-date-v1'
      )
        return false;
      return dailyBarSessionIntervals(day.date, calendar).some((session) =>
        halts.some(
          (halt) =>
            Date.parse(halt.startedAt) < session.closedAt &&
            (!halt.endedAt || Date.parse(halt.endedAt) > session.openedAt),
        ),
      );
    })
    .map((day) => day.date);
  return {
    policy: 'exclude-known-halt-date-v1' as const,
    excludedDates,
    reason:
      '已选保守日线模型排除与已知暂停区间相交的实际交易会话日期；源事实仍是盘中暂停，其他状态保持未知。',
  };
}
