import { Inject, Injectable } from '@nestjs/common';
import type { BarSeriesIdentity, BarSeries, HistoryInput } from '@thesis-ledger/schemas';
import { DsaError } from '../integration/dsa/dsa.client.js';
import { MarketBarWindowReaderV3, type MarketBarWindowReadInputV3 } from './market-bar-reader-v3.js';
import { MarketChartReaderV3 } from './market-chart-reader-v3.js';
import type { MarketBarWindow } from './market-bar-window.js';

export { barSeriesInputFingerprint, sliceBarSeries } from './market-bar-window.js';
export type { MarketBarWindowReadInputV3, MarketBarWindowReadResultV3 } from './market-bar-reader-v3.js';

export class MarketBarUnavailableError extends Error {}

export const isMarketBarTemporarilyUnavailable = (error: unknown) =>
  error instanceof MarketBarUnavailableError ||
  (error instanceof DsaError && (error.code === 'unavailable' || error.code === 'timeout'));

export type BarReadAcceptance = 'interactive' | 'complete' | 'point-in-time';
export type BarReadInput = {
  identity: BarSeriesIdentity;
  window: MarketBarWindow;
  acceptance: BarReadAcceptance;
  refresh?: boolean;
  asOf?: string;
  history?: HistoryInput;
};

@Injectable()
export class MarketBarReader {
  constructor(
    @Inject(MarketBarWindowReaderV3) private readonly windowReader: MarketBarWindowReaderV3,
    @Inject(MarketChartReaderV3) private readonly chartReader: MarketChartReaderV3,
  ) {}

  readV3(input: MarketBarWindowReadInputV3) {
    return this.windowReader.read(input);
  }

  readChartV3(input: BarReadInput): Promise<BarSeries> {
    return this.chartReader.read(input);
  }
}
