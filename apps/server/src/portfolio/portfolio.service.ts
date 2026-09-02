import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { projectCashMaterialization, type StoredCashEvent } from '../ledger/cash-projection.js';
import { positionInputSchema, type CurrencyV1 } from '@thesis-ledger/schemas';
import { roundMoney } from '@thesis-ledger/shared';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import {
  aggregateCurrencyAmounts,
  convertAmount,
  resolveFx,
  supportedCurrency,
  type FxConversionOptions,
} from '../market/fx-conversion.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { InstrumentService } from '../market/instrument.service.js';
import {
  investmentAccountRelationWhere,
  investmentAccountWhere,
} from './investment-account-scope.js';

const isFundSymbol = (symbol: string) => /^\d{6}\.OF$/.test(symbol);
const isZeroDecimal = (value: string) => /^0(?:\.0+)?$/.test(value);

type PositionAssetType = 'stock' | 'etf' | 'fund';
type PortfolioFxOptions = FxConversionOptions;

type PositionOptions = {
  assetName?: string;
  assetType?: PositionAssetType;
};

type PositionInputOptions = {
  assetName?: string | undefined;
  assetType?: PositionAssetType | undefined;
};

type ConfirmedInstrumentSummary = {
  displayName: string;
  assetType: string;
};

const buildPositionOptions = (
  data: PositionInputOptions,
  confirmedInstrument?: ConfirmedInstrumentSummary,
): PositionOptions | undefined => {
  const options: PositionOptions = {};
  if (data.assetName !== undefined) options.assetName = data.assetName;
  else if (confirmedInstrument) options.assetName = confirmedInstrument.displayName;
  if (data.assetType !== undefined) options.assetType = data.assetType;
  else if (confirmedInstrument)
    options.assetType = confirmedInstrument.assetType as PositionAssetType;
  if (Object.keys(options).length === 0) return undefined;
  return options;
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    @Optional() private readonly ledger?: LedgerService,
    @Optional() private readonly instruments?: InstrumentService,
  ) {}

  private requireLedger() {
    if (!this.ledger) throw new Error('LedgerService 未配置，拒绝直接写入 Position');
    return this.ledger;
  }

  private async accountCurrencies(accountId: string | undefined, mode: 'actual' | 'shadow') {
    const accountDelegate = (this.prisma as unknown as { account?: unknown }).account as
      | {
          findMany?: (args: unknown) => Promise<Array<{ id?: string; currency?: string | null }>>;
        }
      | undefined;
    if (typeof accountDelegate?.findMany !== 'function')
      return new Map<string, CurrencyV1>(accountId ? [[accountId, 'CNY']] : []);
    const rows = await accountDelegate.findMany({
      where: accountId ? { id: accountId, mode } : investmentAccountWhere(mode),
      select: { id: true, currency: true },
    });
    return new Map(
      rows.map((row, index) => [
        row.id ?? `__currency-${index}`,
        supportedCurrency(row.currency) ?? 'CNY',
      ]),
    );
  }

  listPositions(accountId?: string, mode: 'actual' | 'shadow' = 'actual') {
    return this.prisma.position.findMany({
      where: accountId
        ? { accountId, account: { mode } }
        : investmentAccountRelationWhere(mode),
      include: { asset: true },
    });
  }

  async upsertPosition(input: unknown) {
    const data = positionInputSchema.parse(input);
    if (data.source === 'manual' && !data.instrumentId && (!data.assetName || !data.assetType))
      throw new BadRequestException('未找到目录标的时需要补充名称和类型');
    const confirmedInstrument = data.instrumentId
      ? await this.instruments?.requireConfirmed(data.instrumentId)
      : undefined;
    if (data.instrumentId && !confirmedInstrument)
      throw new BadRequestException('标的目录服务未配置，不能确认新增持仓');
    if (confirmedInstrument && confirmedInstrument.symbol !== data.symbol)
      throw new BadRequestException('持仓代码与已确认标的不一致');
    const options = buildPositionOptions(data, confirmedInstrument);
    if (options) {
      await this.requireLedger().setPosition(
        data.accountId,
        data.symbol,
        data.quantity,
        data.costPrice,
        data.source,
        '保存当前持仓',
        options,
      );
    } else {
      await this.requireLedger().setPosition(
        data.accountId,
        data.symbol,
        data.quantity,
        data.costPrice,
        data.source,
        '保存当前持仓',
      );
    }
    if (isZeroDecimal(data.quantity))
      return {
        accountId: data.accountId,
        symbol: data.symbol,
        removed: true,
        sourceOfTruth: 'ledger' as const,
      };
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId: data.accountId, symbol: data.symbol } },
      include: { asset: true },
    });
  }

  async setCashBalance(
    accountId: string,
    amount: string,
    source: 'manual' | 'screenshot' = 'manual',
    currency?: CurrencyV1,
  ) {
    await this.requireLedger().setCashBalance(accountId, amount, source, currency);
    return {
      accountId,
      amount,
      ...(currency ? { currency } : {}),
      sourceOfTruth: 'ledger' as const,
    };
  }

  async updatePosition(id: string, input: unknown) {
    const data = positionInputSchema.partial().parse(input);
    const previous = await this.prisma.position.findUniqueOrThrow({ where: { id } });
    const accountId = data.accountId ?? previous.accountId;
    const symbol = data.symbol ?? previous.symbol;
    const quantity = data.quantity ?? previous.quantity.toString();
    const costPrice = data.costPrice ?? previous.costPrice.toString();
    const options = buildPositionOptions(data);
    const identityChanged = accountId !== previous.accountId || symbol !== previous.symbol;

    if (identityChanged) {
      await this.requireLedger().movePositionBaseline({
        positionId: id,
        fromAccountId: previous.accountId,
        fromSymbol: previous.symbol,
        toAccountId: accountId,
        toSymbol: symbol,
        quantity,
        costPrice,
        source: data.source ?? 'manual',
        ...(options ? { options } : {}),
      });
    } else if (options) {
      await this.requireLedger().setPosition(
        accountId,
        symbol,
        quantity,
        costPrice,
        data.source ?? 'manual',
        '手工修改持仓',
        options,
      );
    } else {
      await this.requireLedger().setPosition(
        accountId,
        symbol,
        quantity,
        costPrice,
        data.source ?? 'manual',
        '手工修改持仓',
      );
    }
    if (isZeroDecimal(quantity))
      return { id, accountId, symbol, removed: true, sourceOfTruth: 'ledger' as const };
    return this.prisma.position.findUniqueOrThrow({
      where: { accountId_symbol: { accountId, symbol } },
      include: { asset: true },
    });
  }

  async clearPositions(accountId: string) {
    if (!accountId) throw new BadRequestException('清空持仓需要 accountId');
    const result = await this.requireLedger().clearPositions(accountId);
    return { ...result, sourceOfTruth: 'ledger' as const };
  }

  async removePosition(id: string) {
    const previous = await this.prisma.position.findUniqueOrThrow({ where: { id } });
    await this.requireLedger().setPosition(
      previous.accountId,
      previous.symbol,
      '0',
      previous.costPrice.toString(),
      'manual',
      '手工移除持仓',
    );
    return { id, removed: true, sourceOfTruth: 'ledger' as const };
  }

  async value(
    accountId?: string,
    mode: 'actual' | 'shadow' = 'actual',
    options: PortfolioFxOptions = {},
  ) {
    const [positions, accountCurrencyMap] = await Promise.all([
      this.listPositions(accountId, mode),
      this.accountCurrencies(accountId, mode),
    ]);
    const baseCurrency =
      options.baseCurrency ?? (accountId ? accountCurrencyMap.get(accountId) : undefined) ?? 'CNY';
    const valuationOptions = { ...options, fxMerge: options.fxMerge ?? true, baseCurrency };
    const valuedAt = new Date();
    const valued = await Promise.all(
      positions.map(async (position) => {
        const quantity = Number(position.quantity);
        const costPrice = Number(position.costPrice);
        const currency =
          supportedCurrency(position.asset?.currency) ??
          accountCurrencyMap.get(position.accountId) ??
          baseCurrency;
        try {
          if (isFundSymbol(position.symbol)) {
            if (typeof (this.market as { getFundNav?: unknown }).getFundNav !== 'function')
              throw new Error('基金净值能力未配置');
            const nav = await (
              this.market as unknown as {
                getFundNav: (symbol: string) => Promise<{ unitNav: number; freshness: string }>;
              }
            ).getFundNav(position.symbol);
            const marketValue = roundMoney(quantity * nav.unitNav);
            const costValue = roundMoney(quantity * costPrice);
            return {
              ...position,
              quantity,
              costPrice,
              currency,
              marketPrice: nav.unitNav,
              marketValue,
              costValue,
              pnl: roundMoney(marketValue - costValue),
              pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
              stale: nav.freshness === 'stale',
              freshness: nav.freshness,
            };
          }
          const quote = await this.market.getQuote(position.symbol);
          const marketValue = roundMoney(quantity * quote.price);
          const costValue = roundMoney(quantity * costPrice);
          return {
            ...position,
            quantity,
            costPrice,
            currency,
            marketPrice: quote.price,
            marketValue,
            costValue,
            pnl: roundMoney(marketValue - costValue),
            pnlRatio: costValue === 0 ? null : marketValue / costValue - 1,
            stale: quote.stale,
            freshness: quote.freshness,
          };
        } catch (error) {
          return {
            ...position,
            quantity,
            costPrice,
            currency,
            marketPrice: null,
            marketValue: null,
            costValue: roundMoney(quantity * costPrice),
            pnl: null,
            pnlRatio: null,
            stale: true,
            error: error instanceof Error ? error.message : '行情不可用',
          };
        }
      }),
    );

    const cashByAccountAmounts = new Map<string, Array<{ currency: CurrencyV1; amount: number }>>();
    const cashAmounts: Array<{ accountId: string; currency: CurrencyV1; amount: number }> = [];
    const ledgerDelegate = this.prisma.ledgerEvent as
      | {
          findMany?: (args: unknown) => Promise<unknown[]>;
        }
      | undefined;
    if (typeof ledgerDelegate?.findMany === 'function') {
      const stored = await ledgerDelegate.findMany({
        where: accountId
          ? { accountId, account: { mode } }
          : investmentAccountRelationWhere(mode),
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      });
      const materialization = projectCashMaterialization(stored as StoredCashEvent[]);
      for (const balance of materialization.balances) {
        const id = balance.accountId;
        const accountAmounts = cashByAccountAmounts.get(id) ?? [];
        const currency =
          supportedCurrency(balance.currency) ?? accountCurrencyMap.get(id) ?? baseCurrency;
        const numericAmount = balance.settledAmount.toNumber();
        accountAmounts.push({ currency, amount: numericAmount });
        cashAmounts.push({ accountId: id, currency, amount: numericAmount });
        cashByAccountAmounts.set(id, accountAmounts);
      }
    }

    const currencies = [
      ...new Set([
        ...valued.map((item) => item.currency),
        ...cashAmounts.map((item) => item.currency),
      ]),
    ] as CurrencyV1[];
    const fx = await resolveFx(this.market, currencies, valuationOptions, valuedAt, 'current-rate');
    const aggregateWithScope = (
      amounts: readonly { currency: CurrencyV1; amount: number }[],
      expectedBaseCurrency: CurrencyV1,
    ) => {
      const aggregate = aggregateCurrencyAmounts(amounts, fx);
      if (valuationOptions.fxMerge === true) return aggregate;
      const nativeCompatible = amounts.every((item) => item.currency === expectedBaseCurrency);
      if (nativeCompatible) return aggregate;
      return {
        value: null,
        knownValue: 0,
        complete: false,
        missingCurrencies: [...new Set(amounts.map((item) => item.currency))],
      };
    };
    const marketAggregate = aggregateWithScope(
      valued.flatMap((item) =>
        item.marketValue === null ? [] : [{ currency: item.currency, amount: item.marketValue }],
      ),
      baseCurrency,
    );
    const costAggregate = aggregateWithScope(
      valued.map((item) => ({ currency: item.currency, amount: item.costValue })),
      baseCurrency,
    );
    const cashAggregate = aggregateWithScope(
      cashAmounts.map(({ currency, amount }) => ({ currency, amount })),
      baseCurrency,
    );
    const convertToBase = (amount: number, currency: CurrencyV1) => {
      if (valuationOptions.fxMerge !== true && currency !== baseCurrency) return null;
      return convertAmount(amount, currency, fx);
    };
    const valuedWithBase = valued.map((item) => {
      const baseMarketValue =
        item.marketValue === null ? null : convertToBase(item.marketValue, item.currency);
      const baseCostValue = convertToBase(item.costValue, item.currency);
      return {
        ...item,
        baseMarketValue,
        baseCostValue,
        basePnl:
          baseMarketValue === null || baseCostValue === null
            ? null
            : baseMarketValue - baseCostValue,
      };
    });
    const cashByAccount = [...cashByAccountAmounts.entries()].map(([id, amounts]) => {
      const accountBaseCurrency = accountCurrencyMap.get(id) ?? baseCurrency;
      const aggregate = aggregateWithScope(amounts, accountBaseCurrency);
      const nativeAmount = amounts.every((item) => item.currency === accountBaseCurrency)
        ? amounts.reduce((sum, item) => sum + item.amount, 0)
        : null;
      return {
        accountId: id,
        currency: valuationOptions.fxMerge === true ? baseCurrency : accountBaseCurrency,
        nativeCurrency: accountBaseCurrency,
        nativeAmount,
        amount: roundMoney(aggregate.knownValue),
        partial: !aggregate.complete,
        missingCurrencies: aggregate.missingCurrencies,
      };
    });
    const cashByCurrencyMap = new Map<CurrencyV1, number>();
    for (const item of cashAmounts) {
      cashByCurrencyMap.set(
        item.currency,
        (cashByCurrencyMap.get(item.currency) ?? 0) + item.amount,
      );
    }
    const cashByCurrency = [...cashByCurrencyMap.entries()].map(([currency, amount]) => ({
      currency,
      amount: roundMoney(amount),
      convertedAmount: convertToBase(amount, currency),
    }));
    const missingSymbols = valued
      .filter((item) => item.marketValue === null)
      .map((item) => item.symbol);
    const missingCurrencies = [
      ...new Set([
        ...marketAggregate.missingCurrencies,
        ...costAggregate.missingCurrencies,
        ...cashAggregate.missingCurrencies,
      ]),
    ];
    const partial =
      missingSymbols.length > 0 ||
      !marketAggregate.complete ||
      !costAggregate.complete ||
      !cashAggregate.complete;
    return {
      positions: valuedWithBase,
      cashValue: roundMoney(cashAggregate.knownValue),
      cashByAccount,
      cashByCurrency,
      totalCost: roundMoney(costAggregate.knownValue),
      totalMarketValue: roundMoney(marketAggregate.knownValue + cashAggregate.knownValue),
      totalPnl: roundMoney(valuedWithBase.reduce((sum, item) => sum + (item.basePnl ?? 0), 0)),
      partial,
      mode,
      baseCurrency,
      fx: fx.meta,
      dataQuality: { partial, missingSymbols, missingCurrencies },
      valuedAt: valuedAt.toISOString(),
    };
  }
}
