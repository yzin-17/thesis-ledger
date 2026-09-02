import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import {
  convertAmount,
  resolveFx as resolveFxView,
  type FxConversionMode,
  type ResolvedFx,
} from '../market/fx-conversion.js';
import { performanceAccountWhere } from './performance-account-scope.js';
import type { Currency, PerformanceFxOptions, PortfolioMode } from './performance-types.js';

@Injectable()
export class PerformanceDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async accountCurrencies(accountId: string | undefined, mode: PortfolioMode) {
    const accountDelegate = (this.prisma as unknown as { account?: unknown }).account as
      | {
          findMany?: (args: unknown) => Promise<Array<{ id?: string; currency?: string | null }>>;
        }
      | undefined;
    if (typeof accountDelegate?.findMany !== 'function')
      return new Map<string, Currency>(accountId ? [[accountId, 'CNY']] : []);
    const rows = await accountDelegate.findMany({
      where: performanceAccountWhere(mode, accountId),
      select: { id: true, currency: true },
    });
    return new Map(
      rows.map((row, index) => [
        row.id ?? `__currency-${index}`,
        (row.currency ?? 'CNY') as Currency,
      ]),
    );
  }

  resolveFx(
    currencies: readonly Currency[],
    options: PerformanceFxOptions,
    asOf: Date,
    conversionMode: FxConversionMode = 'current-rate',
  ): Promise<ResolvedFx> {
    return resolveFxView(this.market, currencies, options, asOf, conversionMode);
  }

  async resolveFxByDate(
    currencies: readonly Currency[],
    options: PerformanceFxOptions,
    dates: readonly Date[],
    conversionMode: FxConversionMode,
  ) {
    const uniqueDates = [...new Map(dates.map((date) => [date.getTime(), date])).values()];
    const resolved = await Promise.all(
      uniqueDates.map(
        async (date) =>
          [date.getTime(), await this.resolveFx(currencies, options, date, conversionMode)] as const,
      ),
    );
    return new Map(resolved);
  }

  convertFx(value: number, currency: Currency, fx: ResolvedFx) {
    return convertAmount(value, currency, fx);
  }
}
