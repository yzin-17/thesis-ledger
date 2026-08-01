import { Injectable } from '@nestjs/common';
import { PerformanceService } from '../performance/performance.service.js';
import { MarketStorageService } from '../market/market-storage.service.js';
import { RiskService } from '../risk/risk.service.js';

@Injectable()
export class AutomationWorkflowRunner {
  constructor(
    private readonly storage: MarketStorageService,
    private readonly performance: PerformanceService,
    private readonly risk: RiskService,
  ) {}

  async closeSync(input: { symbols: readonly string[]; timeframe?: '1d' | '1m'; end?: string }) {
    const results = [];
    for (const symbol of input.symbols) {
      results.push(
        await this.storage.syncBars({
          symbol,
          timeframe: input.timeframe ?? '1d',
          mode: 'incremental',
          ...(input.end ? { end: input.end } : {}),
        }),
      );
    }
    return {
      symbols: input.symbols,
      results,
      complete: results.every((result) => result.count >= 0),
    };
  }

  async closeSnapshots(input: { accountIds: readonly string[]; capturedAt: string }) {
    const snapshots = [];
    for (const accountId of input.accountIds)
      snapshots.push(await this.performance.capture(accountId, new Date(input.capturedAt)));
    return { capturedAt: input.capturedAt, snapshots };
  }

  riskScan(contexts: unknown[]) {
    return this.risk.scan(contexts);
  }
}
