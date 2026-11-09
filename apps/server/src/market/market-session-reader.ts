import { Inject, Injectable } from '@nestjs/common';
import { marketSessionDate, marketTimezones, projectMarketSession, type MarketSessionState, type TradingMarket } from '@thesis-ledger/domain';
import type { MarketPeriodCalendarResult } from './market-period-calendar-projection.js';
import { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';

/** 统一读取本地展示日历；按市场和日历日期合并请求，状态每次按查询时点投影。 */
@Injectable()
export class MarketSessionReader {
  private readonly calendars = new Map<string, { expires: number; value: Promise<MarketPeriodCalendarResult> }>();
  constructor(@Inject(MarketPeriodCalendarReader) private readonly reader: Pick<MarketPeriodCalendarReader, 'read'>) {}
  async read(market: TradingMarket, at = new Date(Date.now())): Promise<MarketSessionState> {
    const day = marketSessionDate(at, marketTimezones[market]);
    const key = `${market}:${day}`;
    let entry = this.calendars.get(key);
    if (!entry || entry.expires <= Date.now()) {
      const input = {
        market, start: new Date(Date.parse(day + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10),
        end: new Date(Date.parse(day + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10), evaluationAsOf: at.toISOString(),
      };
      entry = { expires: Date.now() + 300_000, value: this.reader.read(input).catch(() => ({ status: 'unavailable', reason: 'calendar_unavailable' } as const)) };
      this.calendars.set(key, entry);
      if (this.calendars.size > 64) this.calendars.delete(this.calendars.keys().next().value!);
    }
    const result = await entry.value;
    if (result.status !== 'ready') entry.expires = Math.min(entry.expires, Date.now() + 30_000);
    if (result.status === 'ready') return projectMarketSession(result.calendar, at);
    return { ...projectMarketSession(null, at), reason: result.reason === 'calendar_model_unsupported' ? 'calendar_invalid' : result.reason };
  }
}
