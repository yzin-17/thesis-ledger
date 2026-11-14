import { Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { DataQualityService } from '../quality/data-quality.service.js';
import { readWithDataQuality } from './market-data-quality.js';
import {
  projectPeriodCalendar,
  validatePeriodCalendarRequest,
  type MarketPeriodCalendarRequest,
  type MarketPeriodCalendarResult,
} from './market-period-calendar-projection.js';

@Injectable()
export class MarketPeriodCalendarReader {
  constructor(
    private readonly dsa: DsaClient,
    private readonly quality?: DataQualityService,
  ) {}

  async read(input: MarketPeriodCalendarRequest): Promise<MarketPeriodCalendarResult> {
    try {
      validatePeriodCalendarRequest(input);
    } catch {
      return { status: 'unavailable', reason: 'calendar_invalid' };
    }
    try {
      const context = { capability: 'TRADING_CALENDAR', provider: 'dsa', scope: input.market };
      const response = await readWithDataQuality(this.quality, context, () =>
        this.dsa.marketCalendar({
          market: input.market,
          start: input.start,
          end: input.end,
          dataAsOf: input.evaluationAsOf,
        }),
      );
      const result = projectPeriodCalendar(response, input);
      if (
        result.status === 'unavailable' &&
        (result.reason === 'calendar_invalid' || result.reason === 'calendar_incomplete')
      ) {
        await this.quality?.observe({ ...context, code: result.reason }).catch(() => null);
      }
      return result;
    } catch {
      return { status: 'unavailable', reason: 'calendar_unavailable' };
    }
  }
}
