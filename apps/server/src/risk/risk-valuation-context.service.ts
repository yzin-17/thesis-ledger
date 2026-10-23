import { Injectable } from '@nestjs/common';
import type { Currency } from '@thesis-ledger/schemas';
import { resolveFx } from '../market/fx-conversion.js';
import { MarketService } from '../market/market.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { investmentAccountRelationWhere } from '../portfolio/investment-account-scope.js';
import {
  hasRiskBaseValue,
  riskScopeWeights,
  valueRiskPosition,
} from './risk-position-valuation.js';

@Injectable()
export class RiskValuationContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async build(mode: 'actual' | 'shadow', marketTime: string) {
    const positions = await this.prisma.position.findMany({
      where: investmentAccountRelationWhere(mode),
      include: { asset: true },
    });
    const valued = await Promise.all(
      positions.map((row) => valueRiskPosition(row, this.market, marketTime)),
    );
    const currencies = valued.flatMap((row) => (row.currency ? [row.currency] : []));
    const fx = await resolveFx(
      this.market,
      currencies,
      { fxMerge: true, baseCurrency: 'CNY' },
      new Date(marketTime),
    );
    const portfolio = riskScopeWeights(valued, 'CNY', fx, marketTime);
    const accounts = new Map<string, ReturnType<typeof riskScopeWeights>>();
    for (const accountId of new Set(positions.map((row) => row.accountId))) {
      const rows = valued.filter((row) => row.position.accountId === accountId);
      const native = new Set(rows.flatMap((row) => (row.currency ? [row.currency] : [])));
      const base: Currency = native.size === 1 ? [...native][0]! : 'CNY';
      accounts.set(accountId, riskScopeWeights(rows, base, fx, marketTime));
    }
    const contexts = valued.map(({ position, price, quality }) => {
      const account = accounts.get(position.accountId)!;
      const weight = portfolio.weights?.get(position.id);
      const accountWeight = account.weights?.get(position.id);
      const quantity = Number(position.quantity);
      const costPrice = Number(position.costPrice);
      return {
        symbol: position.symbol,
        accountId: position.accountId,
        positionId: position.id,
        mode,
        ...(Number.isFinite(quantity) && quantity >= 0 ? { quantity } : {}),
        ...(Number.isFinite(costPrice) && costPrice >= 0 ? { costPrice } : {}),
        ...(price === undefined ? {} : { price }),
        ...(weight === undefined ? {} : { weight }),
        ...(accountWeight === undefined ? {} : { accountWeight }),
        positionUpdatedAt: position.updatedAt.toISOString(),
        marketTime,
        dataQuality: {
          ...quality,
          portfolioWeight: portfolio.complete ? 'complete' : 'unavailable',
          accountWeight: account.complete ? 'complete' : 'unavailable',
          portfolioCurrency: portfolio.base,
          accountCurrency: account.base,
          portfolioWeightReason: portfolio.reason ?? '',
          accountWeightReason: account.reason ?? '',
          fxEvidenceVersion: fx.meta.evidenceVersion,
        },
      };
    });
    return {
      contexts,
      missingSymbols: valued
        .filter((row) => !hasRiskBaseValue(row, 'CNY', fx, marketTime))
        .map((row) => row.position.symbol),
      valuation: {
        version: 'risk-valuation-v1',
        baseCurrency: 'CNY',
        portfolioComplete: portfolio.complete,
        portfolioReason: portfolio.reason ?? null,
        accounts: [...accounts].map(([accountId, value]) => ({
          accountId,
          complete: value.complete,
          baseCurrency: value.base,
          reason: value.reason ?? null,
        })),
      },
    };
  }
}
