import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { loadConfig } from '../platform/config.js';
import { InstrumentDirectoryService } from '../market/instruments/instrument-directory.service.js';
import {
  MarketBackgroundQuotesService,
  type BackgroundQuoteDemand,
} from '../market/market-background-quotes.service.js';
import { RiskRuleService } from './risk-rule.service.js';
import { observedDataRuleKinds } from './risk-observed-source.js';

@Injectable()
export class RiskMarketDemandService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(RiskMarketDemandService.name);
  constructor(
    private readonly rules: RiskRuleService,
    private readonly db: PrismaService,
    private readonly directory: InstrumentDirectoryService,
    private readonly quotes: MarketBackgroundQuotesService,
  ) {}

  onModuleInit() {
    if (loadConfig().environment === 'test') return;
    // Reconcile local rule demand. Upstream scheduling remains per-source in Market/DSA.
    this.timer = setInterval(() => void this.runNow(), 5000);
    this.timer.unref();
    void this.runNow();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const rules = (await this.rules.listEnabledRules()).filter(
        (r) => !r.sourcePlanId && observedDataRuleKinds.has(r.kind),
      );
      const symbols = new Set<string>();
      for (const rule of rules) if (rule.symbol) symbols.add(rule.symbol);
      if (rules.length) {
        const positions = await this.db.position.findMany({
          where: {
            account: {
              active: true,
              type: { in: ['securities', 'fund'] },
              mode: { in: ['actual', 'shadow'] },
            },
          },
          select: { symbol: true, accountId: true },
        });
        for (const position of positions)
          if (
            rules.some(
              (r) =>
                (!r.symbol || r.symbol === position.symbol) &&
                (!r.accountId || r.accountId === position.accountId),
            )
          )
            symbols.add(position.symbol);
      }
      const directory = await this.directory.resolveSymbols([...symbols]);
      const demands: BackgroundQuoteDemand[] = [...symbols].map((symbol) => {
        const instrument = directory.items.find((item) => item.symbol === symbol && item.active);
        const type = instrument?.instrumentType;
        if (type === 'STOCK' || type === 'ETF' || type === 'INDEX')
          return { symbol, assetType: type };
        return { symbol };
      });
      await this.quotes.reconcile(demands, now);
    } catch (error) {
      this.logger.warn(
        `risk_market_demand_unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
