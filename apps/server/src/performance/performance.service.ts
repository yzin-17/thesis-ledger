import { BadRequestException, Injectable } from '@nestjs/common';
import {
  allocation,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
  rebalanceGap,
  ttwror,
  xirr,
} from '@thesis-ledger/domain';
import type { CurrencyV1 } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';
import { projectCashBalances, type StoredCashEvent } from '../ledger/cash-projection.js';
import {
  incompatibleAccountScopeSummary,
  performanceAccountWhere,
  performanceRelationWhere,
  performanceSnapshotWhere,
} from './performance-account-scope.js';
import { externalPortfolioFlow } from './performance-ledger-flow.js';
import {
  aggregateCurrencyAmounts,
  convertAmount,
  resolveFx as resolveFxView,
  supportedCurrency,
  type FxConversionMeta,
  type FxConversionMode,
  type FxConversionOptions,
  type ResolvedFx,
} from '../market/fx-conversion.js';

type PortfolioMode = 'actual' | 'shadow';
type Currency = CurrencyV1;
type PerformanceFxOptions = FxConversionOptions;
type PerformanceFxMeta = FxConversionMeta;

type NativeSnapshotCurrency = {
  currency: Currency;
  marketValue: number | null;
  costValue: number;
  cashValue: number;
};

type PerformanceSnapshot = {
  id?: string;
  accountId?: string | null;
  capturedAt: Date;
  marketValue: unknown;
  costValue?: unknown;
  cashValue: unknown;
  payload: unknown;
  currency?: Currency;
  estimated?: boolean;
  conversionMode?: FxConversionMode;
  fxAsOf?: string;
  fxStale?: boolean;
  nativeByCurrency?: NativeSnapshotCurrency[];
};

type PerformanceLedgerEvent = {
  accountId: string;
  type: string;
  occurredAt: Date | null;
  payload: Prisma.JsonValue | null;
};

const snapshotPayload = (payload: unknown) =>
  payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

const partialSnapshot = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  if (payload.partial === true) return true;
  const dataQuality = snapshotPayload(payload.dataQuality);
  return dataQuality.partial === true;
};

const snapshotMissingSymbols = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const payload = snapshotPayload(snapshot.payload);
  const direct = payload.missingSymbols;
  if (Array.isArray(direct)) return direct.map(String);
  const dataQuality = snapshotPayload(payload.dataQuality);
  return Array.isArray(dataQuality.missingSymbols) ? dataQuality.missingSymbols.map(String) : [];
};

const snapshotFxMeta = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const value = snapshotPayload(snapshot.payload).fx;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const meta = value as Partial<PerformanceFxMeta>;
  return typeof meta.status === 'string' ? (meta as PerformanceFxMeta) : undefined;
};

const snapshotNativeByCurrency = (snapshot: Pick<PerformanceSnapshot, 'payload'>) => {
  const value = snapshotPayload(snapshot.payload).nativeByCurrency;
  if (!Array.isArray(value)) return undefined;
  const rows = value.flatMap((item): NativeSnapshotCurrency[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const currency = supportedCurrency(row.currency);
    const costValue = Number(row.costValue);
    const cashValue = Number(row.cashValue);
    if (!currency || !Number.isFinite(costValue) || !Number.isFinite(cashValue)) return [];
    const marketValue = row.marketValue === null ? null : Number(row.marketValue);
    if (marketValue !== null && !Number.isFinite(marketValue)) return [];
    return [{ currency, marketValue, costValue, cashValue }];
  });
  return rows.length > 0 ? rows : undefined;
};

const snapshotValue = (snapshot: Pick<PerformanceSnapshot, 'marketValue' | 'cashValue'>) =>
  Number(snapshot.marketValue) + Number(snapshot.cashValue);

const snapshotMode = (snapshot: PerformanceSnapshot) => {
  const payload = snapshotPayload(snapshot.payload);
  return typeof payload.mode === 'string' ? payload.mode : 'actual';
};

const fxResponseFields = (fx: PerformanceFxMeta) => {
  if (!fx.estimated) return {};
  const fxAsOf = fx.fxAsOf ?? fx.asOf;
  return {
    estimated: true,
    ...(fx.conversionMode ? { conversionMode: fx.conversionMode } : {}),
    ...(fxAsOf ? { fxAsOf } : {}),
    fxStale: fx.fxStale ?? fx.stale ?? false,
  };
};

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  private async accountCurrencies(accountId: string | undefined, mode: PortfolioMode) {
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

  private async resolveFx(
    currencies: readonly Currency[],
    options: PerformanceFxOptions,
    asOf: Date,
    conversionMode: FxConversionMode = 'current-rate',
  ): Promise<ResolvedFx> {
    return resolveFxView(this.market, currencies, options, asOf, conversionMode);
  }

  private async resolveFxByDate(
    currencies: readonly Currency[],
    options: PerformanceFxOptions,
    dates: readonly Date[],
    conversionMode: FxConversionMode,
  ) {
    const uniqueDates = [...new Map(dates.map((date) => [date.getTime(), date])).values()];
    const resolved = await Promise.all(
      uniqueDates.map(
        async (date) =>
          [
            date.getTime(),
            await this.resolveFx(currencies, options, date, conversionMode),
          ] as const,
      ),
    );
    return new Map(resolved);
  }

  private convertFx(value: number, currency: Currency, fx: ResolvedFx) {
    return convertAmount(value, currency, fx);
  }

  private groupSnapshotsByCurrency(
    snapshots: PerformanceSnapshot[],
    mode: PortfolioMode,
    fx?: PerformanceFxMeta,
  ) {
    const groups = new Map<
      string,
      {
        currency: Currency;
        capturedAt: Date;
        marketValue: number;
        costValue: number;
        cashValue: number;
        partial: boolean;
        missingSymbols: string[];
      }
    >();
    for (const snapshot of snapshots) {
      const currency = snapshot.currency ?? 'CNY';
      const key = `${currency}:${snapshot.capturedAt.toISOString()}`;
      const current = groups.get(key) ?? {
        currency,
        capturedAt: snapshot.capturedAt,
        marketValue: 0,
        costValue: 0,
        cashValue: 0,
        partial: false,
        missingSymbols: [],
      };
      current.marketValue += Number(snapshot.marketValue);
      current.costValue += Number(snapshot.costValue ?? 0);
      current.cashValue += Number(snapshot.cashValue);
      current.partial ||= partialSnapshot(snapshot);
      current.missingSymbols.push(...snapshotMissingSymbols(snapshot));
      groups.set(key, current);
    }
    return [...groups.values()]
      .sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime())
      .map((group) => ({
        id: `currency-${group.currency}-${group.capturedAt.getTime()}`,
        accountId: null,
        capturedAt: group.capturedAt,
        marketValue: group.marketValue,
        costValue: group.costValue,
        cashValue: group.cashValue,
        currency: group.currency,
        payload: {
          mode,
          partial: group.partial,
          missingSymbols: [...new Set(group.missingSymbols)],
          dataQuality: {
            partial: group.partial,
            missingSymbols: [...new Set(group.missingSymbols)],
          },
          ...(fx ? { fx } : {}),
        },
        ...(fx ? fxResponseFields(fx) : {}),
      }));
  }

  private expandNativeSnapshots(snapshots: PerformanceSnapshot[]) {
    return snapshots.flatMap((snapshot) => {
      const nativeByCurrency = snapshot.nativeByCurrency;
      if (!nativeByCurrency || nativeByCurrency.length === 0) return [snapshot];
      const payload = snapshotPayload(snapshot.payload);
      return nativeByCurrency.map((row) => ({
        ...snapshot,
        ...(snapshot.id ? { id: `${snapshot.id}:${row.currency}` } : {}),
        marketValue: row.marketValue,
        costValue: row.costValue,
        cashValue: row.cashValue,
        currency: row.currency,
        payload: { ...payload, currency: row.currency },
      }));
    });
  }

  private async assertCurrencyScope(
    accountId: string | undefined,
    mode: PortfolioMode,
    options: PerformanceFxOptions = {},
  ) {
    if (accountId || options.fxMerge === true) return;
    const accounts = await this.accountCurrencies(undefined, mode);
    const currencies = new Set(accounts.values());
    if (currencies.size > 1) {
      throw new BadRequestException({
        code: 'MIXED_CURRENCY_SCOPE',
        message: '当前范围包含多个币种，请选择单个账户后再分析',
        currencies: [...currencies],
      });
    }
  }

  async capture(
    accountId?: string,
    capturedAt = new Date(),
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const captureOptions = { ...options, fxMerge: options.fxMerge ?? true };
    await this.assertCurrencyScope(accountId, mode, captureOptions);
    const accountWhere = performanceRelationWhere(mode, accountId);
    const [positions, ledger, accountCurrencyMap] = await Promise.all([
      this.prisma.position.findMany({
        where: accountWhere,
        include: { asset: true },
      }),
      this.prisma.ledgerEvent.findMany({
        where: accountWhere,
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.accountCurrencies(accountId, mode),
    ]);
    const baseCurrency =
      captureOptions.baseCurrency ??
      (accountId ? accountCurrencyMap.get(accountId) : undefined) ??
      'CNY';
    const resolvedCaptureOptions = { ...captureOptions, baseCurrency };
    const valued = await Promise.all(
      positions.map(async (position) => {
        const currency =
          supportedCurrency(position.asset.currency) ??
          accountCurrencyMap.get(position.accountId) ??
          baseCurrency;
        try {
          if (position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)) {
            const nav = await this.market.getFundNav(position.symbol, { allowStale: false });
            return {
              symbol: position.symbol,
              quantity: Number(position.quantity),
              costPrice: Number(position.costPrice),
              assetType: position.asset.assetType,
              currency,
              marketValue: Number(position.quantity) * nav.unitNav,
              nativeCostValue: Number(position.quantity) * Number(position.costPrice),
              provider: nav.provider,
              stale: nav.freshness === 'stale',
              freshness: nav.freshness,
            };
          }
          const quote = await this.market.getQuote(position.symbol, { allowStale: false });
          return {
            symbol: position.symbol,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
            assetType: position.asset.assetType,
            currency,
            marketValue: Number(position.quantity) * quote.price,
            nativeCostValue: Number(position.quantity) * Number(position.costPrice),
            provider: quote.provider,
            stale: quote.stale,
            freshness: quote.freshness,
          };
        } catch (error) {
          return {
            symbol: position.symbol,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
            assetType: position.asset.assetType,
            currency,
            marketValue: null,
            nativeCostValue: Number(position.quantity) * Number(position.costPrice),
            provider: 'unavailable',
            stale: true,
            error: error instanceof Error ? error.message : '行情不可用',
          };
        }
      }),
    );
    const cashBalances = projectCashBalances(ledger);
    const cashAmounts = [...cashBalances.entries()].flatMap(([id, byCurrency]) =>
      [...byCurrency.entries()].map(([currency, amount]) => ({
        accountId: id,
        currency: supportedCurrency(currency) ?? baseCurrency,
        amount: amount.toNumber(),
      })),
    );
    const currencies = [
      ...new Set([
        ...valued.map((position) => position.currency),
        ...cashAmounts.map((item) => item.currency),
      ]),
    ] as Currency[];
    const fx = await this.resolveFx(
      currencies,
      resolvedCaptureOptions,
      capturedAt,
      'historical-rate',
    );
    const marketAggregate = aggregateCurrencyAmounts(
      valued.flatMap((position) =>
        position.marketValue === null
          ? []
          : [{ currency: position.currency, amount: position.marketValue }],
      ),
      fx,
    );
    const costAggregate = aggregateCurrencyAmounts(
      valued.map((position) => ({ currency: position.currency, amount: position.nativeCostValue })),
      fx,
    );
    const cashAggregate = aggregateCurrencyAmounts(
      cashAmounts.map(({ currency, amount }) => ({ currency, amount })),
      fx,
    );
    const knownMarketValue = marketAggregate.knownValue;
    const costValue = costAggregate.knownValue;
    const cashValue = cashAggregate.knownValue;
    const missingSymbols = valued
      .filter((position) => position.marketValue === null)
      .map((position) => position.symbol);
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
    const nativeByCurrencyMap = new Map<Currency, NativeSnapshotCurrency>();
    const ensureNativeCurrency = (currency: Currency) => {
      const current = nativeByCurrencyMap.get(currency) ?? {
        currency,
        marketValue: null,
        costValue: 0,
        cashValue: 0,
      };
      nativeByCurrencyMap.set(currency, current);
      return current;
    };
    for (const position of valued) {
      const current = ensureNativeCurrency(position.currency);
      current.costValue += position.nativeCostValue;
      if (position.marketValue !== null)
        current.marketValue = (current.marketValue ?? 0) + position.marketValue;
    }
    for (const item of cashAmounts) ensureNativeCurrency(item.currency).cashValue += item.amount;
    const nativeByCurrency = [...nativeByCurrencyMap.values()];
    const cashByCurrency = cashAmounts.map((item) => ({
      ...item,
      convertedAmount: this.convertFx(item.amount, item.currency, fx),
    }));
    const payload = {
      positions: valued,
      mode,
      accountScopePolicy: accountId ? 'account-v1' : 'investment-only-v1',
      currency: baseCurrency,
      knownMarketValue,
      totalMarketValue: partial ? null : knownMarketValue,
      partial,
      missingSymbols,
      missingCurrencies,
      cashByCurrency,
      nativeByCurrency,
      fx: fx.meta,
      dataQuality: {
        partial,
        missingSymbols,
        missingCurrencies,
      },
    };
    const snapshotDelegate = this.prisma.portfolioSnapshot as unknown as {
      findMany?: (args: unknown) => Promise<Array<{ payload: unknown }>>;
      findFirst?: (args: unknown) => Promise<{ payload: unknown } | null>;
    };
    const existingSnapshots =
      typeof snapshotDelegate.findMany === 'function'
        ? await snapshotDelegate.findMany({
            where: { accountId: accountId ?? null, capturedAt },
          })
        : [
            await snapshotDelegate.findFirst?.({
              where: { accountId: accountId ?? null, capturedAt },
            }),
          ].filter(
            (snapshot): snapshot is { payload: unknown } =>
              snapshot !== null && snapshot !== undefined,
          );
    const existing = existingSnapshots.find((snapshot) => {
      const payload = snapshot.payload;
      return typeof payload !== 'object' || payload === null || !('mode' in payload)
        ? mode === 'actual'
        : (payload as { mode?: unknown }).mode === mode;
    });
    if (existing) return existing;
    return this.prisma.portfolioSnapshot.create({
      data: {
        ...(accountId ? { accountId } : {}),
        capturedAt,
        marketValue: knownMarketValue,
        costValue,
        cashValue,
        payload,
      },
    });
  }

  async summary(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const snapshots = await this.history(accountId, start, end, mode, options);
    const accountCurrencyMap = await this.accountCurrencies(accountId, mode);
    const currencies = [
      ...new Set([
        ...accountCurrencyMap.values(),
        ...snapshots.flatMap((snapshot) =>
          snapshot.currency === undefined ? [] : [snapshot.currency],
        ),
      ]),
    ] as Currency[];
    const fx = await this.resolveFx(currencies, options, new Date());
    const incompatibleScope = incompatibleAccountScopeSummary(
      snapshots,
      accountId,
      fx.meta,
      fxResponseFields(fx.meta),
    );
    if (incompatibleScope) return incompatibleScope;
    const partialSnapshots = snapshots.filter(partialSnapshot);
    if (partialSnapshots.length > 0) {
      throw new BadRequestException({
        code: 'PARTIAL_PORTFOLIO_SNAPSHOT',
        message: '收益分析包含行情缺失的 partial snapshot，请补齐行情后重试',
        snapshotIds: partialSnapshots.flatMap((snapshot) => (snapshot.id ? [snapshot.id] : [])),
        missingSymbols: [...new Set(partialSnapshots.flatMap(snapshotMissingSymbols))],
      });
    }
    const snapshotFxEvidence = snapshots
      .map(snapshotFxMeta)
      .filter((fx): fx is PerformanceFxMeta => fx !== undefined);
    const blockedSnapshotFx = snapshotFxEvidence.find(
      (snapshotFx) => snapshotFx.status === 'blocked',
    );
    if (options.fxMerge && blockedSnapshotFx) {
      return {
        accountId: accountId ?? null,
        snapshots,
        ttwror: null,
        xirr: null,
        xirrReason: '无法获取完整历史汇率，暂时无法计算本位币收益',
        fx: fx.meta,
        fxEvidence: snapshotFxEvidence,
        ...fxResponseFields(fx.meta),
      };
    }
    if (snapshots.length < 2) {
      return {
        accountId: accountId ?? null,
        snapshots,
        ttwror: null,
        xirr: null,
        xirrReason: '至少需要两个完整快照',
        fx: fx.meta,
        ...fxResponseFields(fx.meta),
      };
    }

    if (!accountId && currencies.length > 1 && !options.fxMerge) {
      return {
        accountId: null,
        snapshots,
        ttwror: null,
        xirr: null,
        xirrReason: '混合币种未合并，收益请按币种查看',
        fx: fx.meta,
        ...fxResponseFields(fx.meta),
      };
    }

    if (options.fxMerge && fx.meta.status === 'blocked') {
      return {
        accountId: accountId ?? null,
        snapshots,
        ttwror: null,
        xirr: null,
        xirrReason: '无法获取有效汇率，暂时无法计算合并收益',
        fx: fx.meta,
        ...fxResponseFields(fx.meta),
      };
    }

    const firstSnapshot = snapshots[0]!;
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const accountWhere = performanceRelationWhere(mode, accountId);
    const externalEvents = (await this.prisma.ledgerEvent.findMany({
      where: {
        ...accountWhere,
        type: 'CASH_FLOW',
        occurredAt: { gt: firstSnapshot.capturedAt, lte: lastSnapshot.capturedAt },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    })) as PerformanceLedgerEvent[];

    const flowCurrencies = externalEvents.map((event) => {
      const flow = externalPortfolioFlow(event);
      return (
        flow.currency ??
        (event.accountId ? accountCurrencyMap.get(event.accountId) : undefined) ??
        options.baseCurrency ??
        'CNY'
      );
    });
    const historicalFxByDate = options.fxMerge
      ? await this.resolveFxByDate(
          [...new Set([...currencies, ...flowCurrencies])],
          options,
          externalEvents.flatMap((event) => (event.occurredAt ? [event.occurredAt] : [])),
          'historical-rate',
        )
      : new Map<number, ResolvedFx>();
    const blockedHistoricalFx = [...historicalFxByDate.values()].find(
      (historicalFx) => historicalFx.meta.status === 'blocked',
    );
    if (blockedHistoricalFx) {
      return {
        accountId: accountId ?? null,
        snapshots,
        ttwror: null,
        xirr: null,
        xirrReason: '无法获取完整历史汇率，暂时无法计算本位币收益',
        fx: fx.meta,
        fxEvidence: [...historicalFxByDate.values()].map((historicalFx) => historicalFx.meta),
        ...fxResponseFields(fx.meta),
      };
    }

    const convertFlow = (event: PerformanceLedgerEvent) => {
      const flow = externalPortfolioFlow(event);
      if (flow.amount === 0) return 0;
      const currency =
        flow.currency ??
        (event.accountId ? accountCurrencyMap.get(event.accountId) : undefined) ??
        options.baseCurrency ??
        'CNY';
      if (!options.fxMerge) return flow.amount;
      const eventFx = event.occurredAt
        ? historicalFxByDate.get(event.occurredAt.getTime())
        : undefined;
      if (!eventFx) return flow.amount;
      return this.convertFx(flow.amount, currency, eventFx) ?? 0;
    };

    const valuations = snapshots.map((snapshot, index) => {
      const previous = index === 0 ? undefined : snapshots[index - 1];
      const externalFlow = previous
        ? externalEvents.reduce((sum, event) => {
            if (event.occurredAt === null) return sum;
            if (event.occurredAt <= previous.capturedAt || event.occurredAt > snapshot.capturedAt)
              return sum;
            return sum + convertFlow(event);
          }, 0)
        : 0;
      return {
        date: snapshot.capturedAt.toISOString(),
        value: snapshotValue(snapshot),
        ...(index === 0 ? {} : { externalFlow }),
      };
    });

    const cashFlows = [
      {
        date: firstSnapshot.capturedAt.toISOString(),
        amount: -snapshotValue(firstSnapshot),
      },
      ...externalEvents.flatMap((event) => {
        if (event.occurredAt === null) return [];
        const portfolioFlow = convertFlow(event);
        return portfolioFlow === 0
          ? []
          : [{ date: event.occurredAt.toISOString(), amount: -portfolioFlow }];
      }),
      {
        date: lastSnapshot.capturedAt.toISOString(),
        amount: snapshotValue(lastSnapshot),
      },
    ];

    return {
      accountId: accountId ?? null,
      snapshots,
      fx: fx.meta,
      ...(historicalFxByDate.size > 0
        ? { fxEvidence: [...historicalFxByDate.values()].map((historicalFx) => historicalFx.meta) }
        : {}),
      ...fxResponseFields(fx.meta),
      ...this.calculate({ valuations, cashFlows }),
    };
  }

  async saveTargets(
    scope: 'account' | 'portfolio',
    targets: Record<string, number>,
    accountId?: string,
  ) {
    const normalizedTargetResult = normalizeAllocationTargets(targets);
    if (normalizedTargetResult.unknown.length > 0)
      throw new BadRequestException(
        `无法识别配置类别: ${normalizedTargetResult.unknown.join('、')}`,
      );
    const normalizedTargets = normalizedTargetResult.targets;
    const values = Object.values(normalizedTargets);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
      throw new BadRequestException('目标权重必须是非负有限数字');
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-8)
      throw new BadRequestException('目标权重之和必须为 100%');
    await this.prisma.targetAllocation.updateMany({
      where: { scope, accountId: accountId ?? null, active: true },
      data: { active: false },
    });
    const latest = await this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null },
      orderBy: { version: 'desc' },
    });
    return this.prisma.targetAllocation.create({
      data: {
        scope,
        ...(accountId === undefined ? {} : { accountId }),
        version: (latest?.version ?? 0) + 1,
        targets: normalizedTargets,
        active: true,
      },
    });
  }

  async targets(
    scope: 'account' | 'portfolio',
    accountId?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const explicitTarget = await this.prisma.targetAllocation.findFirst({
      where: { scope, accountId: accountId ?? null, active: true },
      orderBy: { version: 'desc' },
    });
    if (explicitTarget) return { ...explicitTarget, source: 'explicit' as const };
    if (scope === 'account') {
      return {
        scope,
        accountId: accountId ?? null,
        targets: {},
        source: 'none' as const,
      };
    }

    const accounts = await this.prisma.account.findMany({
      where: performanceAccountWhere(mode),
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return {
        scope,
        accountId: null,
        targets: {},
        source: 'none' as const,
      };
    }

    const storedTargets = await this.prisma.targetAllocation.findMany({
      where: {
        scope: 'account',
        accountId: { in: accountIds },
        active: true,
      },
      orderBy: [{ accountId: 'asc' }, { version: 'desc' }],
    });
    const latestTargetsByAccount = new Map<string, (typeof storedTargets)[number]>();
    for (const target of storedTargets) {
      if (target.accountId && !latestTargetsByAccount.has(target.accountId)) {
        latestTargetsByAccount.set(target.accountId, target);
      }
    }
    if (latestTargetsByAccount.size === 0) {
      return {
        scope,
        accountId: null,
        targets: {},
        source: 'none' as const,
      };
    }

    const currentLayers = await this.layers(undefined, undefined, mode, options);
    if (!currentLayers.portfolio) {
      return {
        scope,
        accountId: null,
        targets: {},
        source: 'none' as const,
        aggregationUnavailableReason: 'mixed-currency' as const,
      };
    }

    const accountValues = new Map(
      currentLayers.account.map((account) => [
        account.accountId,
        Math.max(0, (account.marketValue ?? 0) + (account.cashValue ?? 0)),
      ]),
    );
    const weightedTargets: Array<{
      accountId: string;
      accountValue: number;
      targets: Record<string, number>;
    }> = [];
    for (const [targetAccountId, target] of latestTargetsByAccount) {
      const rawTargets =
        target.targets && typeof target.targets === 'object' && !Array.isArray(target.targets)
          ? (target.targets as Record<string, number>)
          : {};
      const normalized = normalizeAllocationTargets(rawTargets);
      if (normalized.unknown.length > 0 || Object.keys(normalized.targets).length === 0) continue;
      weightedTargets.push({
        accountId: targetAccountId,
        accountValue: accountValues.get(targetAccountId) ?? 0,
        targets: normalized.targets,
      });
    }
    if (weightedTargets.length === 0) {
      return {
        scope,
        accountId: null,
        targets: {},
        source: 'none' as const,
      };
    }

    const totalAccountValue = weightedTargets.reduce((sum, target) => sum + target.accountValue, 0);
    const equalAccountWeight = 1 / weightedTargets.length;
    const aggregatedTargets: Record<string, number> = {};
    for (const target of weightedTargets) {
      const accountWeight =
        totalAccountValue > 0 ? target.accountValue / totalAccountValue : equalAccountWeight;
      for (const [category, targetWeight] of Object.entries(target.targets)) {
        aggregatedTargets[category] =
          (aggregatedTargets[category] ?? 0) + targetWeight * accountWeight;
      }
    }
    const aggregateTotal = Object.values(aggregatedTargets).reduce(
      (sum, targetWeight) => sum + targetWeight,
      0,
    );
    if (aggregateTotal > 0) {
      for (const category of Object.keys(aggregatedTargets)) {
        aggregatedTargets[category] = (aggregatedTargets[category] ?? 0) / aggregateTotal;
      }
    }
    return {
      scope,
      accountId: null,
      targets: aggregatedTargets,
      source: 'account-aggregate' as const,
      aggregatedAccountCount: weightedTargets.length,
    };
  }

  async history(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const accountCurrencyMap = await this.accountCurrencies(accountId, mode);
    const currencies = [...new Set([...accountCurrencyMap.values()])] as Currency[];
    const mixedCurrencyScope = !accountId && currencies.length > 1;
    const useAccountSnapshots = !accountId && mixedCurrencyScope;
    const snapshots = (await this.prisma.portfolioSnapshot.findMany({
      where: {
        ...performanceSnapshotWhere(accountId, useAccountSnapshots, mode),
        ...(start || end
          ? {
              capturedAt: {
                ...(start ? { gte: new Date(start) } : {}),
                ...(end ? { lte: new Date(end) } : {}),
              },
            }
          : {}),
      },
      include: { account: { select: { currency: true } } },
      orderBy: { capturedAt: 'asc' },
    })) as Array<PerformanceSnapshot & { account?: { currency?: string | null } | null }>;
    const filtered = snapshots
      .filter((snapshot) => snapshotMode(snapshot) === mode)
      .map((snapshot) => {
        const payload = snapshotPayload(snapshot.payload);
        const payloadCurrency = supportedCurrency(payload.currency);
        const nativeByCurrency = snapshotNativeByCurrency(snapshot);
        return {
          ...snapshot,
          ...(nativeByCurrency ? { nativeByCurrency } : {}),
          currency: (payloadCurrency ??
            snapshot.account?.currency ??
            (snapshot.accountId ? accountCurrencyMap.get(snapshot.accountId) : currencies[0]) ??
            'CNY') as Currency,
        };
      });
    if (!options.fxMerge) {
      const nativeSnapshots = this.expandNativeSnapshots(filtered);
      return useAccountSnapshots
        ? this.groupSnapshotsByCurrency(nativeSnapshots, mode)
        : nativeSnapshots;
    }

    const snapshotCurrencies = [
      ...new Set([
        ...currencies,
        ...filtered.flatMap(
          (snapshot) =>
            snapshot.nativeByCurrency?.map((row) => row.currency) ?? [snapshot.currency ?? 'CNY'],
        ),
      ]),
    ] as Currency[];
    const fxByDate = await this.resolveFxByDate(
      snapshotCurrencies,
      options,
      filtered.map((snapshot) => snapshot.capturedAt),
      'historical-rate',
    );
    const blockedFx = [...fxByDate.values()].find((fx) => fx.meta.status === 'blocked');
    if (blockedFx) return this.groupSnapshotsByCurrency(filtered, mode, blockedFx.meta);

    const withFx = (snapshot: (typeof filtered)[number], fx: ResolvedFx): PerformanceSnapshot => {
      const sourceCurrency = snapshot.currency ?? 'CNY';
      const nativeByCurrency = snapshot.nativeByCurrency ?? [
        {
          currency: sourceCurrency,
          marketValue: Number(snapshot.marketValue),
          costValue: Number(snapshot.costValue ?? 0),
          cashValue: Number(snapshot.cashValue),
        },
      ];
      const market = aggregateCurrencyAmounts(
        nativeByCurrency.flatMap((row) =>
          row.marketValue === null ? [] : [{ currency: row.currency, amount: row.marketValue }],
        ),
        fx,
      );
      const cost = aggregateCurrencyAmounts(
        nativeByCurrency.map((row) => ({ currency: row.currency, amount: row.costValue })),
        fx,
      );
      const cash = aggregateCurrencyAmounts(
        nativeByCurrency.map((row) => ({ currency: row.currency, amount: row.cashValue })),
        fx,
      );
      const canConvert = market.complete && cost.complete && cash.complete;
      const payload = snapshotPayload(snapshot.payload);
      return {
        ...snapshot,
        ...(canConvert
          ? {
              marketValue: market.value,
              costValue: cost.value,
              cashValue: cash.value,
              ...(fx.meta.baseCurrency ? { currency: fx.meta.baseCurrency } : {}),
            }
          : {}),
        payload: { ...payload, fx: fx.meta },
        ...fxResponseFields(fx.meta),
      };
    };

    if (!useAccountSnapshots) {
      return filtered.map((snapshot) =>
        withFx(snapshot, fxByDate.get(snapshot.capturedAt.getTime())!),
      );
    }

    const byAccount = new Map<string, typeof filtered>();
    for (const id of accountCurrencyMap.keys()) {
      if (!id.startsWith('__currency-')) byAccount.set(id, []);
    }
    for (const snapshot of filtered) {
      const key = snapshot.accountId ?? '__portfolio';
      const values = byAccount.get(key) ?? [];
      values.push(snapshot);
      byAccount.set(key, values);
    }
    const timestamps = [...new Set(filtered.map((snapshot) => snapshot.capturedAt.getTime()))].sort(
      (left, right) => left - right,
    );
    const merged: PerformanceSnapshot[] = [];
    for (const timestamp of timestamps) {
      let marketValue = 0;
      let costValue = 0;
      let cashValue = 0;
      let partial = false;
      const missingSymbols: string[] = [];
      const evidence: PerformanceFxMeta[] = [];
      let included = 0;
      for (const accountSnapshots of byAccount.values()) {
        const point = [...accountSnapshots]
          .reverse()
          .find((snapshot) => snapshot.capturedAt.getTime() <= timestamp);
        if (!point) {
          partial = true;
          continue;
        }
        const pointFx = fxByDate.get(point.capturedAt.getTime());
        if (!pointFx) {
          partial = true;
          continue;
        }
        const converted = withFx(point, pointFx);
        if (converted.currency !== pointFx.meta.baseCurrency) {
          partial = true;
          continue;
        }
        included += 1;
        marketValue += Number(converted.marketValue);
        costValue += Number(converted.costValue ?? 0);
        cashValue += Number(converted.cashValue);
        missingSymbols.push(...snapshotMissingSymbols(point));
        partial ||= partialSnapshot(point);
        evidence.push(pointFx.meta);
      }
      if (included === 0) continue;
      const primaryFx = evidence[0];
      merged.push({
        id: `fx-${timestamp}`,
        accountId: null,
        capturedAt: new Date(timestamp),
        marketValue,
        costValue,
        cashValue,
        ...(primaryFx?.baseCurrency ? { currency: primaryFx.baseCurrency } : {}),
        payload: {
          mode,
          accountScopePolicy: 'investment-only-v1',
          partial,
          missingSymbols: [...new Set(missingSymbols)],
          dataQuality: { partial, missingSymbols: [...new Set(missingSymbols)] },
          fx: primaryFx,
          fxEvidence: evidence,
        },
        ...(primaryFx ? fxResponseFields(primaryFx) : {}),
      });
    }
    return merged;
  }

  calculate(input: {
    valuations: { date: string; value: number; externalFlow?: number }[];
    cashFlows: { date: string; amount: number }[];
  }) {
    let moneyWeightedReturn: number | null = null;
    let xirrReason: string | null = null;
    try {
      moneyWeightedReturn = xirr(input.cashFlows);
    } catch (error) {
      xirrReason = error instanceof Error ? error.message : 'XIRR 无法计算';
    }
    return { ttwror: ttwror(input.valuations), xirr: moneyWeightedReturn, xirrReason };
  }

  allocate(input: {
    positions: { category: string; marketValue: number }[];
    targets?: Record<string, number>;
    dataQuality?: { partial: boolean; missingSymbols: string[] };
  }) {
    if (input.positions.some((position) => position.marketValue < 0))
      throw new BadRequestException('资产市值不能为负数');
    const positions = input.positions.map((position) => {
      const category = normalizeAllocationCategory(position.category);
      if (!category) throw new BadRequestException(`无法识别配置类别: ${position.category}`);
      return { ...position, category };
    });
    const normalizedTargetResult = normalizeAllocationTargets(input.targets);
    if (normalizedTargetResult.unknown.length > 0)
      throw new BadRequestException(
        `无法识别配置类别: ${normalizedTargetResult.unknown.join('、')}`,
      );
    const targets = input.targets ? normalizedTargetResult.targets : undefined;
    const partial = input.dataQuality?.partial === true;
    const missingSymbols = input.dataQuality?.missingSymbols ?? [];
    const calculatedAllocation = allocation(positions);
    return {
      allocation: partial
        ? calculatedAllocation.map((item) => ({ ...item, weight: null }))
        : calculatedAllocation,
      rebalance: partial || !targets ? [] : rebalanceGap(positions, targets),
      partial,
      missingSymbols,
    };
  }

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
      | {
          findMany?: (args: unknown) => Promise<unknown[]>;
        }
      | undefined;
    const [positions, storedLedger, accountCurrencyMap] = await Promise.all([
      this.prisma.position.findMany({ where: positionWhere, include: { asset: true } }),
      typeof ledgerDelegate?.findMany === 'function'
        ? ledgerDelegate.findMany({
            where: ledgerWhere,
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          })
        : Promise.resolve([]),
      this.accountCurrencies(accountId, mode),
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
    type NativeCurrencyTotals = {
      currency: Currency;
      nativeCostValue: number;
      nativeMarketValue: number;
      nativeCashValue: number;
      partial: boolean;
      missingSymbols: string[];
    };
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
    if (accountId) {
      ensureAccountCurrency(accountId, accountCurrencyMap.get(accountId) ?? 'CNY');
    }
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
    const fx = await this.resolveFx(currencies, options, valuedAt);
    const merged = fx.meta.enabled && fx.meta.status !== 'blocked';
    const conversionRequested = options.fxMerge === true;
    const security = securityNative.map((item) => {
      let marketValue: number | null = null;
      if (item.nativeMarketValue !== null) {
        marketValue = conversionRequested
          ? this.convertFx(item.nativeMarketValue, item.currency, fx)
          : item.nativeMarketValue;
      }
      const costValue = conversionRequested
        ? this.convertFx(item.nativeCostValue, item.currency, fx)
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
      if (conversionRequested) {
        value = aggregate.knownValue;
      } else if (nativeCompatible) {
        value = aggregate.value;
      } else {
        complete = false;
        for (const row of rows) missingCurrencies.add(row.currency);
      }
      return {
        value,
        complete,
        missingCurrencies: [...missingCurrencies],
      };
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
