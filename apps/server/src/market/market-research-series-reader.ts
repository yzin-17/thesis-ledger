import { Inject, Injectable } from '@nestjs/common';
import { marketMinutePeriodSchema } from '@thesis-ledger/schemas';
import { MarketBarReader } from './market-bar-reader.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import { MarketMinuteDisplayService } from './market-minute-display.service.js';
import { MarketNativeIndicatorReader } from './market-native-indicator-reader.js';
import { marketChartRequest } from './market-chart-request.js';
import { hasNativeChartRoute } from './market-native-chart-route.js';
import { selectIndicatorParameters } from './market-indicator-request.js';
import { indicatorReadInput, indicatorWindows, projectIndicatorResponse, MAX_CHART_V3_INDICATOR_INPUT_POINTS } from './market-indicator-window.js';

@Injectable()
export class MarketResearchSeriesReader {
  constructor(
    @Inject(MarketBarReader) private readonly bars: MarketBarReader,
    @Inject(MarketChartReaderV3) private readonly chart: MarketChartReaderV3,
    @Inject(MarketMinuteDisplayService) private readonly minutes: MarketMinuteDisplayService,
    @Inject(MarketNativeIndicatorReader) private readonly indicators: MarketNativeIndicatorReader,
  ) {}
  async read(input: { symbol: string; assetType: 'STOCK' | 'ETF'; timeframe: string; limit: number; indicator?: 'MA' | 'MACD' | 'RSI' }) {
    const query = { assetType: input.assetType, timeframe: input.timeframe, adjustment: input.timeframe === '1d' ? 'qfq' : 'none', limit: String(input.limit) };
    const minute = marketMinutePeriodSchema.safeParse(input.timeframe);
    const requests = input.indicator ? [{ name: input.indicator, parameters: selectIndicatorParameters(input.indicator, undefined) }] : [];
    if (minute.success && !await hasNativeChartRoute(this.chart, input.symbol, input.timeframe, input.assetType)) {
      if (input.indicator) return this.minutes.indicator(input.symbol, minute.data, query, requests);
      return this.minutes.bars(input.symbol, minute.data, query);
    }
    const request = marketChartRequest(input.symbol, query);
    if (!input.indicator) return this.bars.readChartV3(request);
    const acquired = await this.bars.readChartV3(indicatorReadInput(request, requests, MAX_CHART_V3_INDICATOR_INPUT_POINTS));
    const { visible, calculation } = indicatorWindows(acquired, request, requests);
    return projectIndicatorResponse(await this.indicators.calculate(calculation, requests), calculation, visible);
  }
}
