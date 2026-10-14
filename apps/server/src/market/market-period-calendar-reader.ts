import { Injectable } from '@nestjs/common';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import {
  projectPeriodCalendar,
  validatePeriodCalendarRequest,
  type MarketPeriodCalendarRequest,
  type MarketPeriodCalendarResult,
} from './market-period-calendar-projection.js';

@Injectable()
export class MarketPeriodCalendarReader {
  constructor(private readonly dsa: DsaClient) {}

  async read(input: MarketPeriodCalendarRequest): Promise<MarketPeriodCalendarResult> {
    try {
      validatePeriodCalendarRequest(input);
    } catch {
      return { status: 'unavailable', reason: 'calendar_invalid' };
    }
    try {
      const response = await this.dsa.marketCalendar({
        market: input.market,
        start: input.start,
        end: input.end,
        dataAsOf: input.evaluationAsOf,
      });
      return projectPeriodCalendar(response, input);
    } catch {
      return { status: 'unavailable', reason: 'calendar_unavailable' };
    }
  }
}
