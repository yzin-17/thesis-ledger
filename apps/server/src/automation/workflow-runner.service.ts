import { Injectable } from '@nestjs/common';
import { PerformanceService } from '../performance/performance.service.js';
import { MarketStorageService } from '../market/market-storage.service.js';
import { RiskService } from '../risk/risk.service.js';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class AutomationWorkflowRunner {
  constructor(
    private readonly storage: MarketStorageService,
    private readonly performance: PerformanceService,
    private readonly risk: RiskService,
    private readonly prisma: PrismaService,
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

  /** 估值快照按账户自身的数据模式拍摄；每种出现的数据模式再追加一次组合聚合快照，点亮「全部账户」视图。 */
  async closeSnapshots(input: {
    accountIds: readonly string[];
    capturedAt: string;
    valuationBasis?: 'ESTIMATED' | 'OFFICIAL';
  }) {
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: [...input.accountIds] } },
      select: { id: true, mode: true },
    });
    const accountModes = new Map(accounts.map((account) => [account.id, account.mode]));
    const capturedAt = new Date(input.capturedAt);
    const snapshots = [];
    const modes = new Set<string>();
    for (const accountId of input.accountIds) {
      const mode = accountModes.get(accountId);
      if (!mode) continue;
      modes.add(mode);
      snapshots.push(
        await this.performance.capture(
          accountId,
          capturedAt,
          mode === 'shadow' ? 'shadow' : 'actual',
          {},
          { source: 'DAILY_CLOSE', valuationBasis: input.valuationBasis ?? 'ESTIMATED' },
        ),
      );
    }
    for (const mode of modes) {
      snapshots.push(
        await this.performance.capture(
          undefined,
          capturedAt,
          mode === 'shadow' ? 'shadow' : 'actual',
          {},
          { source: 'DAILY_CLOSE', valuationBasis: input.valuationBasis ?? 'ESTIMATED' },
        ),
      );
    }
    return { capturedAt: input.capturedAt, snapshots };
  }

  riskScan(contexts: unknown[], evaluatedAt?: string, includeStrategyRules = true) {
    return this.risk.scan(
      evaluatedAt ? { contexts, evaluatedAt, includeStrategyRules } : { contexts, includeStrategyRules },
    );
  }
}
