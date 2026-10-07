import type { BacktestCorporateActionFact } from '@thesis-ledger/domain';
import {
  compareMarketPitEvidenceInstantStringsV1,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { collectEventTypes } from './backtest-dependency-events.js';

type DecisionTick = { occurredAt: string; tradingDate?: string };

/** V3 信号事实逐日对齐实际决策时钟；Domain 旧 V2 求值行为保持不变。 */
export function requireV3EventSignalVisibility(input: {
  strategy: Pick<BacktestStrategy, 'entry' | 'exit'>;
  facts: readonly BacktestCorporateActionFact[];
  ticks: readonly DecisionTick[];
  symbol: string;
  market: string;
}): void {
  const eventTypes = new Set(collectEventTypes(input.strategy));
  if (eventTypes.size === 0) return;
  const ticksByDate = new Map<string, DecisionTick>();
  for (const tick of input.ticks) {
    if (!tick.tradingDate) continue;
    const prior = ticksByDate.get(tick.tradingDate);
    if (!prior) {
      ticksByDate.set(tick.tradingDate, tick);
      continue;
    }
    const order = compareMarketPitEvidenceInstantStringsV1(tick.occurredAt, prior.occurredAt);
    if (order === undefined) throw new Error('DATA_UNAVAILABLE: 公司行动信号决策时钟无效');
    if (order < 0) ticksByDate.set(tick.tradingDate, tick);
  }
  for (const fact of input.facts) {
    if (
      fact.symbol !== input.symbol ||
      fact.market !== input.market ||
      !eventTypes.has(fact.type)
    ) {
      continue;
    }
    if (!fact.effectiveDate) {
      throw new Error('DATA_UNAVAILABLE: 公司行动信号缺少 effectiveDate');
    }
    const tick = ticksByDate.get(fact.effectiveDate);
    if (!tick) continue;
    const availabilityOrder = compareMarketPitEvidenceInstantStringsV1(
      fact.availableAt,
      tick.occurredAt,
    );
    if (availabilityOrder === undefined || availabilityOrder > 0) {
      throw new Error('DATA_UNAVAILABLE: 公司行动信号事实晚于决策时钟或时间无效');
    }
    const visibility = fact.strategyVisibility;
    if (!visibility) {
      throw new Error('DATA_UNAVAILABLE: 公司行动信号缺少策略可见性');
    }
    if (visibility.kind === 'conservative-day') {
      if (visibility.visibleDate >= fact.effectiveDate) {
        throw new Error('DATA_UNAVAILABLE: 公司行动信号尚未达到保守可见日');
      }
      continue;
    }
    const announcementOrder = compareMarketPitEvidenceInstantStringsV1(
      visibility.announcedAt,
      tick.occurredAt,
    );
    if (announcementOrder === undefined || announcementOrder > 0) {
      throw new Error('DATA_UNAVAILABLE: 公司行动公告晚于决策时钟或时间无效');
    }
  }
}
