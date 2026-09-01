import { Injectable } from '@nestjs/common';
import { automationJobTypes, type AutomationJobType } from '@thesis-ledger/schemas';
import { RecurringCashDepositService } from '../cash-plans/recurring-cash-deposit.service.js';
import { MarketService } from '../market/market.service.js';
import { DataExportService } from '../platform/data-export.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { ProviderHealthService } from '../providers/provider-health.service.js';
import { investmentAccountWhere } from '../portfolio/investment-account-scope.js';
import type { AutomationHandler } from './automation.service.js';
import { AutomationWorkflowRunner } from './workflow-runner.service.js';
import { dailyDigest, dailyRiskSummary } from './workflows.service.js';

@Injectable()
export class AutomationRuntimeHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: AutomationWorkflowRunner,
    private readonly market: MarketService,
    private readonly providerHealth: ProviderHealthService,
    private readonly dataExport: DataExportService,
    private readonly recurringCashDeposits: RecurringCashDepositService,
  ) {}

  for(type: AutomationJobType): AutomationHandler {
    return this.all()[type];
  }

  private all(): Record<AutomationJobType, AutomationHandler> {
    const handlers = {
      'market-sync': this.handler('market-sync', async (_signal, scheduledAt) => {
        const positions = await this.prisma.position.findMany({
          where: { account: { mode: 'actual', active: true } },
          select: { symbol: true },
        });
        const symbols = [...new Set(positions.map((position) => position.symbol))];
        return this.workflows.closeSync({
          symbols,
          timeframe: '1d',
          end: scheduledAt.toISOString(),
        });
      }),
      'risk-evaluation': this.handler('risk-evaluation', async (_signal, scheduledAt) => {
        const positions = await this.prisma.position.findMany({
          where: { account: { mode: 'actual', active: true } },
          include: { asset: true },
        });
        const valued = await Promise.all(
          positions.map(async (position) => {
            try {
              const price =
                position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)
                  ? (await this.market.getFundNav(position.symbol, { allowStale: false })).unitNav
                  : (await this.market.getQuote(position.symbol, { allowStale: false })).price;
              return {
                position,
                price,
                marketValue: Number(position.quantity) * price,
              };
            } catch {
              return null;
            }
          }),
        );
        const available = valued.filter((item) => item !== null);
        const totalValue = available.reduce((sum, item) => sum + item.marketValue, 0);
        const accountValues = available.reduce((totals, item) => {
          totals.set(
            item.position.accountId,
            (totals.get(item.position.accountId) ?? 0) + item.marketValue,
          );
          return totals;
        }, new Map<string, number>());
        const marketTime = scheduledAt.toISOString();
        const contexts = available.map(({ position, price, marketValue }) => ({
          symbol: position.symbol,
          accountId: position.accountId,
          positionId: position.id,
          quantity: Number(position.quantity),
          mode: 'actual' as const,
          price,
          costPrice: Number(position.costPrice),
          positionUpdatedAt: position.updatedAt.toISOString(),
          weight: totalValue === 0 ? 0 : marketValue / totalValue,
          accountWeight:
            (accountValues.get(position.accountId) ?? 0) === 0
              ? 0
              : marketValue / accountValues.get(position.accountId)!,
          dataQuality: { marketData: 'fresh' },
          marketTime,
        }));
        const result = await this.workflows.riskScan(contexts);
        return {
          ...result,
          contextCount: contexts.length,
          missingSymbols: positions
            .filter((position) => !available.some((item) => item.position.id === position.id))
            .map((position) => position.symbol),
        };
      }),
      'daily-digest': this.handler('daily-digest', async (_signal, scheduledAt) => {
        const since = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
        const riskEvents = await this.prisma.riskEvent.findMany({
          where: { evaluatedAt: { gte: since, lte: scheduledAt } },
          orderBy: { evaluatedAt: 'asc' },
        });
        const risk = dailyRiskSummary(
          riskEvents.map((event) => ({ severity: event.severity, triggered: event.triggered })),
        );
        const events = riskEvents
          .filter((event): event is typeof event & { symbol: string } => event.symbol !== null)
          .map((event) => ({
            symbol: event.symbol,
            kind: 'risk-event',
            publishedAt: event.evaluatedAt.toISOString(),
          }));
        return dailyDigest({
          date: scheduledAt.toISOString().slice(0, 10),
          events,
          risk,
          attention: riskEvents
            .filter((event) => event.triggered && ['error', 'critical'].includes(event.severity))
            .map((event) => event.message),
        });
      }),
      snapshot: this.handler('snapshot', async (_signal, scheduledAt) => {
        const accounts = await this.prisma.account.findMany({
          where: investmentAccountWhere('actual'),
          select: { id: true },
        });
        return this.workflows.closeSnapshots({
          accountIds: accounts.map((account) => account.id),
          capturedAt: scheduledAt.toISOString(),
        });
      }),
      backup: this.handler('backup', async () => this.dataExport.exportAccount()),
      'provider-health': this.handler('provider-health', async () => ({
        checks: await this.providerHealth.checkAll('scheduled'),
      })),
      'cash-deposit-materialization': this.handler(
        'cash-deposit-materialization',
        async (_signal, scheduledAt) => this.recurringCashDeposits.materializeDue(scheduledAt),
      ),
    } satisfies Record<AutomationJobType, AutomationHandler>;

    if (Object.keys(handlers).length !== automationJobTypes.length)
      throw new Error('Automation handler registry 不完整');
    return handlers;
  }

  private handler(type: AutomationJobType, run: AutomationHandler['run']): AutomationHandler {
    return { type, run };
  }
}
