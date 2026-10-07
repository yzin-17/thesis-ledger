import { Injectable } from '@nestjs/common';
import { PerformanceService } from '../performance/performance.service.js';
import { MarketBarReader, MarketBarUnavailableError } from '../market/market-bar-reader.js';
import { MarketService } from '../market/market.service.js';
import { inferAssetType } from '../ledger/asset-type.js';
import { RiskService } from '../risk/risk.service.js';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class AutomationWorkflowRunner {
  constructor(
    private readonly bars: MarketBarReader,
    private readonly performance: PerformanceService,
    private readonly risk: RiskService,
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async closeSync(input: { symbols: readonly string[]; timeframe?: '1d' | '1m'; end: string }) {
    if (input.timeframe === '1m') throw new MarketBarUnavailableError('分钟线尚无现行精确来源');
    const date = input.end.slice(0, 10);
    const results = [];
    for (const symbol of input.symbols) {
      const normalized = symbol.trim().toUpperCase();
      const inferred = inferAssetType(normalized);
      const assetType = inferred === 'fund' ? 'MUTUAL_FUND' : inferred?.toUpperCase();
      if (assetType !== 'STOCK' && assetType !== 'ETF' && assetType !== 'MUTUAL_FUND')
        throw new Error(`无法可靠识别行情标的类型: ${symbol}`);
      if (assetType === 'MUTUAL_FUND') {
        const history = await this.market.getFundNavHistory(normalized, { end: date, limit: 1 }, { refresh: true });
        const latest = history.at(-1);
        if (!latest || latest.freshness === 'stale' || latest.freshness === 'unavailable' || latest.fallbackUsed)
          throw new MarketBarUnavailableError(`基金净值未完成同步: ${normalized}`);
        results.push({ symbol: normalized, count: 1, lastTimestamp: latest.navDate });
        continue;
      }
      let market: 'CN' | 'HK' | 'US';
      if (/\.(SH|SZ|BJ)$/.test(normalized)) market = 'CN';
      else if (/\.HK$/.test(normalized)) market = 'HK';
      else if (/\.US$/.test(normalized)) market = 'US';
      else throw new Error(`无法可靠识别行情标的市场: ${symbol}`);
      const selected = await this.bars.readV3({
        market,
        symbol: normalized,
        routeKey: {
          kind: 'bar', market, assetType,
          capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none',
        },
        window: { start: date, end: date },
      });
      if (selected.status !== 'selected') throw new MarketBarUnavailableError(`日线未完成同步: ${normalized}`);
      const points = selected.selection.response.bars;
      results.push({ symbol: normalized, count: points.length, lastTimestamp: points.at(-1)?.timestamp ?? null });
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
    return this.risk.scan(contexts, {
      ...(evaluatedAt ? { evaluatedAt: new Date(evaluatedAt) } : {}),
      includeStrategyRules,
    });
  }
}
