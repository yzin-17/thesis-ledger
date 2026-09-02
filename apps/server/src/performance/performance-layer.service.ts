import { Injectable } from '@nestjs/common';
import { projectCashBalances, type StoredCashEvent } from '../ledger/cash-projection.js';
import { aggregateCurrencyAmounts, supportedCurrency } from '../market/fx-conversion.js';
import { MarketService } from '../market/market.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { performanceAccountWhere, performanceRelationWhere } from './performance-account-scope.js';
import { PerformanceDataService } from './performance-data.service.js';
import {
  fxResponseFields,
  type Currency,
  type PerformanceFxOptions,
  type PortfolioMode,
} from './performance-types.js';

type NativeCurrencyTotals = {
  currency: Currency;
  nativeCostValue: number;
  nativeMarketValue: number;
  nativeCashValue: number;
  partial: boolean;
  missingSymbols: string[];
};

@Injectable()
export class PerformanceLayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    private readonly data: PerformanceDataService,
  ) {}

  async layers(
    accountId?: string,
    symbol?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const positionWhere = {
      ...(accountId ? { accountId } : {}),
      ...(symbol ? { symbol } : {}),
      account: performanceAccountWhere(mode, accountId),
    };
    const ledgerWhere = performanceRelationWhere(mode, accountId);
    const ledgerDelegate = (this.prisma as unknown as { ledgerEvent?: unknown }).ledgerEvent as
      | { findMany?: (args: unknown) => Promise<unknown[]> }
      | undefined;
    const [positions, storedLedger, accountCurrencyMap] = await Promise.all([
      this.prisma.position.findMany({ where: positionWhere, include: { asset: true } }),
      typeof ledgerDelegate?.findMany === 'function'
        ? ledgerDelegate.findMany({
            where: ledgerWhere,
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          })
        : Promise.resolve([]),
      this.data.accountCurrencies(accountId, mode),
    ]);
    const ledger = storedLedger;
    const valuedAt = new Date();
    const securityNative = await Promise.all(
      positions.map(async (position) => {
        let marketValue: number | null = null;
        try {
          marketValue =
            position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)
              ? Number(position.quantity) *
                (await this.market.getFundNav(position.symbol, { allowStale: false })).unitNav
              : Number(position.quantity) *
                (await this.market.getQuote(position.symbol, { allowStale: false })).price;
        } catch {
          // 保留 null，调用方可以区分缺行情和零市值。
        }
        const currency =
          supportedCurrency(position.asset.currency) ??
          accountCurrencyMap.get(position.accountId) ??
          'CNY';
        const costValue = Number(position.quantity) * Number(position.costPrice);
        return {
          accountId: position.accountId,
          symbol: position.symbol,
          assetType: position.asset.assetType,
          currency,
          nativeCostValue: costValue,
          nativeMarketValue: marketValue,
          nativeUnrealizedPnl: marketValue === null ? null : marketValue - costValue,
        };
      }),
    );
    const cashBalances = projectCashBalances(ledger as StoredCashEvent[]);
    const byAccountCurrency = new Map<string, Map<Currency, NativeCurrencyTotals>>();
    const ensureAccountCurrency = (id: string, currency: Currency) => {
      const currenciesForAccount =
        byAccountCurrency.get(id) ?? new Map<Currency, NativeCurrencyTotals>();
      const current = currenciesForAccount.get(currency) ?? {
        currency,
        nativeCostValue: 0,
        nativeMarketValue: 0,
        nativeCashValue: 0,
        partial: false,
        missingSymbols: [],
      };
      currenciesForAccount.set(currency, current);
      byAccountCurrency.set(id, currenciesForAccount);
      return current;
    };
    for (const [id, currency] of accountCurrencyMap.entries()) {
      if (!id.startsWith('__currency-')) ensureAccountCurrency(id, currency);
    }
    if (accountId) ensureAccountCurrency(accountId, accountCurrencyMap.get(accountId) ?? 'CNY');
    const cashAmounts = [...cashBalances.entries()].flatMap(([id, byCurrency]) =>
      [...byCurrency.entries()].map(([rawCurrency, amount]) => {
        const currency = supportedCurrency(rawCurrency) ?? accountCurrencyMap.get(id) ?? 'CNY';
        const current = ensureAccountCurrency(id, currency);
        current.nativeCashValue += amount.toNumber();
        return { accountId: id, currency, amount: amount.toNumber() };
      }),
    );
    for (const item of securityNative) {
      const current = ensureAccountCurrency(item.accountId, item.currency);
      current.nativeCostValue += item.nativeCostValue;
      current.nativeMarketValue += item.nativeMarketValue ?? 0;
      if (item.nativeMarketValue === null) {
        current.partial = true;
        current.missingSymbols.push(item.symbol);
      }
    }
    const currencies = [
      ...new Set([
        ...accountCurrencyMap.values(),
        ...securityNative.map((item) => item.currency),
        ...cashAmounts.map((item) => item.currency),
      ]),
    ] as Currency[];
    const fx = await this.data.resolveFx(currencies, options, valuedAt);
    const merged = fx.meta.enabled && fx.meta.status !== 'blocked';
    const conversionRequested = options.fxMerge === true;
    const security = securityNative.map((item) => {
      let marketValue: number | null = null;
      if (item.nativeMarketValue !== null) {
        marketValue = conversionRequested
          ? this.data.convertFx(item.nativeMarketValue, item.currency, fx)
          : item.nativeMarketValue;
      }
      const costValue = conversionRequested
        ? this.data.convertFx(item.nativeCostValue, item.currency, fx)
        : item.nativeCostValue;
      return {
        accountId: item.accountId,
        symbol: item.symbol,
        assetType: item.assetType,
        currency: item.currency,
        nativeCostValue: item.nativeCostValue,
        nativeMarketValue: item.nativeMarketValue,
        costValue,
        marketValue,
        unrealizedPnl: marketValue === null || costValue === null ? null : marketValue - costValue,
      };
    });
    const sameCurrencyValue = (
      rows: readonly NativeCurrencyTotals[],
      key: 'nativeCostValue' | 'nativeMarketValue' | 'nativeCashValue',
    ) => {
      const currenciesInRows = [...new Set(rows.map((row) => row.currency))];
      if (currenciesInRows.length > 1) return null;
      return rows.reduce((total, row) => total + row[key], 0);
    };
    const aggregateAccountValue = (
      rows: readonly NativeCurrencyTotals[],
      key: 'nativeCostValue' | 'nativeMarketValue' | 'nativeCashValue',
      baseCurrency: Currency,
    ) => {
      const aggregate = aggregateCurrencyAmounts(
        rows.map((row) => ({ currency: row.currency, amount: row[key] })),
        fx,
      );
      const nativeCompatible = rows.every((row) => row.currency === baseCurrency);
      let value: number | null = null;
      let complete = aggregate.complete;
      const missingCurrencies = new Set(aggregate.missingCurrencies);
      if (conversionRequested) value = aggregate.knownValue;
      else if (nativeCompatible) value = aggregate.value;
      else {
        complete = false;
        for (const row of rows) missingCurrencies.add(row.currency);
      }
      return { value, complete, missingCurrencies: [...missingCurrencies] };
    };
    const account = [...byAccountCurrency.entries()].map(([id, rowsByCurrency]) => {
      const rows = [...rowsByCurrency.values()];
      const baseCurrency =
        accountCurrencyMap.get(id) ?? rows[0]?.currency ?? options.baseCurrency ?? 'CNY';
      const cost = aggregateAccountValue(rows, 'nativeCostValue', baseCurrency);
      const market = aggregateAccountValue(rows, 'nativeMarketValue', baseCurrency);
      const cash = aggregateAccountValue(rows, 'nativeCashValue', baseCurrency);
      const missingSymbols = [...new Set(rows.flatMap((row) => row.missingSymbols))];
      return {
        accountId: id,
        currency: baseCurrency,
        nativeCostValue: sameCurrencyValue(rows, 'nativeCostValue'),
        nativeMarketValue: sameCurrencyValue(rows, 'nativeMarketValue'),
        nativeCashValue: sameCurrencyValue(rows, 'nativeCashValue'),
        costValue: cost.value,
        marketValue: market.value,
        cashValue: cash.value,
        partial:
          rows.some((row) => row.partial) || !cost.complete || !market.complete || !cash.complete,
        missingSymbols,
        missingCurrencies: [
          ...new Set([
            ...cost.missingCurrencies,
            ...market.missingCurrencies,
            ...cash.missingCurrencies,
          ]),
        ],
      };
    });
    const byCurrencyMap = new Map<Currency, NativeCurrencyTotals>();
    for (const rowsByCurrency of byAccountCurrency.values()) {
      for (const value of rowsByCurrency.values()) {
        const current = byCurrencyMap.get(value.currency) ?? {
          currency: value.currency,
          nativeCostValue: 0,
          nativeMarketValue: 0,
          nativeCashValue: 0,
          partial: false,
          missingSymbols: [],
        };
        current.nativeCostValue += value.nativeCostValue;
        current.nativeMarketValue += value.nativeMarketValue;
        current.nativeCashValue += value.nativeCashValue;
        current.partial ||= value.partial;
        current.missingSymbols.push(...value.missingSymbols);
        byCurrencyMap.set(value.currency, current);
      }
    }
    for (const currency of currencies) {
      if (!byCurrencyMap.has(currency))
        byCurrencyMap.set(currency, {
          currency,
          nativeCostValue: 0,
          nativeMarketValue: 0,
          nativeCashValue: 0,
          partial: false,
          missingSymbols: [],
        });
    }
    const byCurrency = [...byCurrencyMap.values()].map((value) => ({
      currency: value.currency,
      nativeCostValue: value.nativeCostValue,
      nativeMarketValue: value.nativeMarketValue,
      nativeCashValue: value.nativeCashValue,
      costValue: value.nativeCostValue,
      marketValue: value.nativeMarketValue,
      cashValue: value.nativeCashValue,
      partial: value.partial,
      missingSymbols: [...new Set(value.missingSymbols)],
    }));
    const hasSingleCurrency = byCurrency.length <= 1;
    const nativePortfolio = hasSingleCurrency
      ? byCurrency.reduce(
          (total, value) => ({
            ...total,
            currency: value.currency,
            costValue: total.costValue + (value.costValue ?? 0),
            marketValue: total.marketValue + (value.marketValue ?? 0),
            cashValue: total.cashValue + (value.cashValue ?? 0),
            partial: total.partial || value.partial,
            missingSymbols: [...total.missingSymbols, ...value.missingSymbols],
          }),
          {
            currency: byCurrency[0]?.currency,
            costValue: 0,
            marketValue: 0,
            cashValue: 0,
            partial: false,
            missingSymbols: [] as string[],
          },
        )
      : null;
    const mergedPortfolio = merged
      ? account.reduce(
          (total, value) => ({
            ...total,
            currency: fx.meta.baseCurrency,
            costValue: total.costValue + (value.costValue ?? 0),
            marketValue: total.marketValue + (value.marketValue ?? 0),
            cashValue: total.cashValue + (value.cashValue ?? 0),
            partial: total.partial || value.partial,
            missingSymbols: [...total.missingSymbols, ...value.missingSymbols],
          }),
          {
            currency: fx.meta.baseCurrency,
            costValue: 0,
            marketValue: 0,
            cashValue: 0,
            partial: false,
            missingSymbols: [] as string[],
          },
        )
      : null;
    const portfolio = mergedPortfolio ?? nativePortfolio;
    return {
      security,
      account,
      portfolio: portfolio
        ? { ...portfolio, missingSymbols: [...new Set(portfolio.missingSymbols)] }
        : null,
      byCurrency,
      valuedAt: valuedAt.toISOString(),
      fx: fx.meta,
      ...fxResponseFields(fx.meta),
      dataQuality: {
        partial:
          (portfolio?.partial ?? byCurrency.some((value) => value.partial)) ||
          fx.meta.status === 'blocked',
        missingSymbols: [
          ...new Set(
            portfolio?.missingSymbols ?? byCurrency.flatMap((value) => value.missingSymbols),
          ),
        ],
        missingCurrencies: fx.meta.missingCurrencies,
      },
    };
  }
}
