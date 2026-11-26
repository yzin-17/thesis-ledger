import { DecimalValue as D } from './decimal.js';
import type { BacktestTradePlan } from './backtest-trade-plan-contract.js';
import type { SimulationFillRecord } from './backtest-simulation.js';
import { readTradePlanCalendar, type TradePlanCalendar } from './backtest-trade-plan-calendar.js';
export type { TradePlanCalendar } from './backtest-trade-plan-calendar.js';

/** 只消费已接受成交的账本净收益；现金分配不进入完整交易窗口。 */
export class BacktestTradeLossPause {
  private active = false;
  private cycleNet = '0';
  private completedNet: string[] = [];
  private pausedAt: string | undefined;
  private readonly fills = new Set<string>();
  constructor(
    private readonly config: NonNullable<BacktestTradePlan['lossPause']>,
    private readonly source: TradePlanCalendar | undefined,
    private readonly diagnostics: string[],
  ) {}
  snapshot() {
    return {
      active: this.active,
      cycleNet: this.cycleNet,
      completedNet: [...this.completedNet],
      ...(this.pausedAt ? { pausedAt: this.pausedAt } : {}),
    };
  }
  accept(fill: SimulationFillRecord, remainingQuantity: string, realizedPnl?: string) {
    if (this.fills.has(fill.fillId)) return;
    if (fill.side === 'buy') {
      if (!this.active) this.cycleNet = '0';
      this.active = true;
    } else {
      if (!this.active || realizedPnl === undefined) throw new Error('LOSS_PAUSE_NET_PNL_MISSING');
      this.cycleNet = D.from(this.cycleNet).plus(realizedPnl).toString();
      if (D.from(remainingQuantity).isZero()) {
        this.active = false;
        this.completedNet = [...this.completedNet, this.cycleNet].slice(
          -this.config.completedTrades,
        );
        if (
          this.completedNet.length === this.config.completedTrades &&
          this.completedNet.every((value) => D.from(value).compareTo('0') < 0)
        )
          this.pausedAt = fill.occurredAt;
      }
    }
    this.fills.add(fill.fillId);
  }

  entryAllowed(at: string): boolean {
    const calendar = this.availableCalendar(at);
    if (!calendar) return false;
    const current = calendar.status(at);
    if (current.reason === 'calendar-unavailable') return this.unavailable(at, 'COVERAGE');
    if (!this.pausedAt) return true;
    const start = calendar.status(this.pausedAt);
    if (!start.open) return this.unavailable(at, 'CLOSE_DATE');
    if (current.date <= start.date) return false;
    const cursor = new Date(`${start.date}T12:00:00Z`);
    let count = 0;
    // 不查未来交易日；仅观察截至本次决策日已发生的日历日期。
    for (let inspected = 0; inspected < 5000; inspected++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const date = cursor.toISOString().slice(0, 10);
      if (date > current.date) return false;
      const day = calendar.status(cursor);
      if (day.date !== date || day.reason === 'calendar-unavailable')
        return this.unavailable(at, 'COVERAGE');
      if (day.open) count++;
      if (count > this.config.tradingDays) {
        this.pausedAt = undefined;
        return true;
      }
    }
    return this.unavailable(at, 'COVERAGE');
  }
  private availableCalendar(at: string) {
    const result = readTradePlanCalendar(this.source, at);
    if (result.status === 'unavailable') {
      this.unavailable(at, result.reason);
      return;
    }
    return result.calendar;
  }
  private unavailable(at: string, reason: string): false {
    this.diagnostics.push(`${at}:LOSS_PAUSE_CALENDAR_${reason}`);
    return false;
  }
}
