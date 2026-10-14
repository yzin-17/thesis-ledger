import type {
  TradingCalendar,
  BacktestCorporateActionFact,
  SimulationTick,
} from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';

export function knownCashEntitlementV3(
  calendar: TradingCalendar,
  config: Pick<RunConfigV3, 'startDate' | 'knownCashPreparation'>,
) {
  return config.knownCashPreparation
    ? new KnownCashEntitlementV3(
        calendar,
        config.startDate,
        config.knownCashPreparation.input.policy.entitlement,
      )
    : undefined;
}

/** 新规则按登记截止成交持有份额；旧版本按原决策回调的已结算数量重放。 */
export class KnownCashEntitlementV3 {
  private readonly quantities = new Map<string, string>();
  constructor(
    private readonly calendar: TradingCalendar,
    private readonly startDate: string,
    readonly version:
      | 'settled-record-date-holdings'
      | 'cn-etf-record-close-holdings-v2' = 'settled-record-date-holdings',
  ) {}

  capture(decisionAt: string, settledQuantity: string): void {
    const date = this.calendar.status(new Date(decisionAt)).date;
    if (this.version === 'cn-etf-record-close-holdings-v2' && this.quantities.has(date)) {
      if (this.quantities.get(date) !== settledQuantity)
        throw new Error('登记截止权益已冻结，拒绝改写');
      return;
    }
    this.quantities.set(date, settledQuantity);
  }

  captureLegacy(decisionAt: string, settledQuantity: string): void {
    if (this.version === 'settled-record-date-holdings') this.capture(decisionAt, settledQuantity);
  }

  checkpoint(facts: readonly BacktestCorporateActionFact[], quantityAt: () => string) {
    if (this.version === 'settled-record-date-holdings') return {};
    return {
      positionCheckpoint: {
        ticks: this.closeTicks(facts),
        captureAt: (tick: SimulationTick) => this.capture(tick.occurredAt, quantityAt()),
      },
    };
  }

  closeTicks(facts: readonly BacktestCorporateActionFact[]): SimulationTick[] {
    if (this.version === 'settled-record-date-holdings') return [];
    if (this.calendar.market !== 'CN' || this.calendar.timezone !== 'Asia/Shanghai')
      throw new Error('登记收盘资格版本仅支持境内场内ETF研究');
    return [
      ...new Set(
        facts.filter((fact) => fact.type === 'CASH_DIVIDEND').map((fact) => fact.recordDate),
      ),
    ]
      .filter((date): date is string => date !== undefined && date >= this.startDate)
      .sort()
      .map((date) => {
        const sessions = this.calendar.sessionsForDate(`${date}T00:00:00+08:00`);
        if (sessions.length === 0) throw new Error('登记日缺少有效交易截止时点');
        const close = Math.max(...sessions.map((session) => session.end));
        const occurredAt = new Date(
          Date.parse(`${date}T00:00:00+08:00`) + close * 60000,
        ).toISOString();
        return { occurredAt, availableAt: occurredAt, tradingDate: date };
      });
  }

  quantityFor(fact: BacktestCorporateActionFact): string {
    if (fact.type !== 'CASH_DIVIDEND' || !fact.recordDate)
      throw new Error('现金登记资格缺少明确登记日');
    if (fact.recordDate < this.startDate) return '0';
    const quantity = this.quantities.get(fact.recordDate);
    if (quantity === undefined) throw new Error('登记日已结算持仓未冻结，无法计算现金资格');
    return quantity;
  }
}
