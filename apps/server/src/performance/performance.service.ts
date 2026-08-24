import { BadRequestException, Injectable } from '@nestjs/common';
import {
  allocation,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
  projectCashBalance,
  rebalanceGap,
  ttwror,
  xirr,
  type LedgerEvent,
} from '@thesis-ledger/domain';
import type { CurrencyV1, FxRateV1, FxRatesResponseV1 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketService } from '../market/market.service.js';

type PortfolioMode = 'actual' | 'shadow';
type Currency = CurrencyV1;

type PerformanceFxOptions = {
  fxMerge?: boolean;
  baseCurrency?: Currency;
};

type PerformanceFxMeta = {
  enabled: boolean;
  status: 'disabled' | 'not_needed' | 'ready' | 'stale' | 'blocked';
  baseCurrency?: Currency;
  asOf?: string;
  fxAsOf?: string;
  estimated?: boolean;
  conversionMode?: 'current-rate';
  stale?: boolean;
  fxStale?: boolean;
  missingCurrencies: Currency[];
  rates: FxRateV1[];
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
  conversionMode?: 'current-rate';
  fxAsOf?: string;
  fxStale?: boolean;
};

type PerformanceLedgerEvent = {
  accountId?: string;
  type: string;
  occurredAt: Date;
  amount: unknown;
};

type PrismaLedgerEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date;
  symbol: string | null;
  quantity: unknown;
  price: unknown;
  amount: unknown;
  fee: unknown;
  tax: unknown;
  metadata?: unknown;
};

const EXTERNAL_FLOW_TYPES = [
  'CASH_DEPOSIT',
  'CASH_WITHDRAW',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
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

const snapshotValue = (snapshot: Pick<PerformanceSnapshot, 'marketValue' | 'cashValue'>) =>
  Number(snapshot.marketValue) + Number(snapshot.cashValue);

const snapshotMode = (snapshot: PerformanceSnapshot) => {
  const payload = snapshotPayload(snapshot.payload);
  return typeof payload.mode === 'string' ? payload.mode : 'actual';
};

const toLedgerEvent = (event: PrismaLedgerEvent): LedgerEvent => ({
  id: event.id,
  accountId: event.accountId,
  type: event.type as LedgerEvent['type'],
  occurredAt: event.occurredAt.toISOString(),
  ...(event.symbol === null ? {} : { symbol: event.symbol }),
  ...(event.quantity === null ? {} : { quantity: Number(event.quantity) }),
  ...(event.price === null ? {} : { price: Number(event.price) }),
  ...(event.amount === null ? {} : { amount: Number(event.amount) }),
  ...(event.fee === null ? {} : { fee: Number(event.fee) }),
  ...(event.tax === null ? {} : { tax: Number(event.tax) }),
  ...(event.metadata && typeof event.metadata === 'object'
    ? { metadata: event.metadata as Record<string, unknown> }
    : {}),
});

const externalPortfolioFlow = (event: Pick<PerformanceLedgerEvent, 'type' | 'amount'>) => {
  const amount = Number(event.amount ?? 0);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (event.type === 'CASH_DEPOSIT' || event.type === 'TRANSFER_IN') return amount;
  if (event.type === 'CASH_WITHDRAW' || event.type === 'TRANSFER_OUT') return -amount;
  return 0;
};

const fxResponseFields = (fx: PerformanceFxMeta) => {
  if (!fx.estimated) return {};
  const fxAsOf = fx.fxAsOf ?? fx.asOf;
  return {
    estimated: true,
    conversionMode: 'current-rate' as const,
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
      where: { ...(accountId ? { id: accountId } : {}), mode },
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
  ): Promise<{ meta: PerformanceFxMeta; rates: Map<Currency, number> }> {
    const uniqueCurrencies = [...new Set(currencies)];
    const fxMerge = options.fxMerge === true;
    const baseCurrency = options.baseCurrency ?? 'CNY';
    if (!fxMerge)
      return {
        meta: {
          enabled: false,
          status: uniqueCurrencies.length > 1 ? 'disabled' : 'not_needed',
          missingCurrencies: [],
          rates: [],
        },
        rates: new Map(),
      };
    if (uniqueCurrencies.length <= 1)
      return {
        meta: {
          enabled: false,
          status: 'not_needed',
          baseCurrency,
          missingCurrencies: [],
          rates: [],
        },
        rates: new Map([[uniqueCurrencies[0] ?? baseCurrency, 1]]),
      };

    let response: FxRatesResponseV1;
    try {
      response = await this.market.getFxRates({
        baseCurrency,
        currencies: uniqueCurrencies,
        asOf: asOf.toISOString(),
      });
    } catch {
      return {
        meta: {
          enabled: true,
          status: 'blocked',
          baseCurrency,
          asOf: asOf.toISOString(),
          fxAsOf: asOf.toISOString(),
          estimated: true,
          conversionMode: 'current-rate',
          missingCurrencies: uniqueCurrencies,
          rates: [],
        },
        rates: new Map(),
      };
    }
    const available = response.rates.filter((rate) => rate.available && rate.rate !== undefined);
    const rateMap = new Map(available.map((rate) => [rate.fromCurrency, rate.rate!]));
    const missingCurrencies = uniqueCurrencies.filter((currency) => !rateMap.has(currency));
    const stale = available.some((rate) => rate.stale);
    return {
      meta: {
        enabled: true,
        status: missingCurrencies.length > 0 ? 'blocked' : stale ? 'stale' : 'ready',
        baseCurrency,
        asOf: response.asOf,
        fxAsOf: response.asOf,
        estimated: true,
        conversionMode: 'current-rate',
        stale,
        fxStale: stale,
        missingCurrencies,
        rates: response.rates,
      },
      rates: rateMap,
    };
  }

  private convertFx(
    value: number,
    currency: Currency,
    fx: { meta: PerformanceFxMeta; rates: Map<Currency, number> },
  ) {
    if (!fx.meta.enabled || fx.meta.status === 'disabled' || fx.meta.status === 'not_needed')
      return value;
    const rate = fx.rates.get(currency);
    return rate === undefined ? null : value * rate;
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

  private async assertCurrencyScope(accountId: string | undefined, mode: PortfolioMode) {
    if (accountId) return;
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

  async capture(accountId?: string, capturedAt = new Date(), mode: PortfolioMode = 'actual') {
    await this.assertCurrencyScope(accountId, mode);
    const accountWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
    const [positions, ledger] = await Promise.all([
      this.prisma.position.findMany({
        where: accountWhere,
        include: { asset: true },
      }),
      this.prisma.ledgerEvent.findMany({
        where: accountWhere,
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const valued = await Promise.all(
      positions.map(async (position) => {
        try {
          if (position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol)) {
            const nav = await this.market.getFundNav(position.symbol, { allowStale: false });
            return {
              symbol: position.symbol,
              quantity: Number(position.quantity),
              costPrice: Number(position.costPrice),
              assetType: position.asset.assetType,
              marketValue: Number(position.quantity) * nav.unitNav,
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
            marketValue: Number(position.quantity) * quote.price,
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
            marketValue: null,
            provider: 'unavailable',
            stale: true,
            error: error instanceof Error ? error.message : '行情不可用',
          };
        }
      }),
    );
    const knownMarketValue = valued.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
    const costValue = valued.reduce(
      (sum, position) => sum + position.quantity * position.costPrice,
      0,
    );
    const cash = projectCashBalance(ledger.map(toLedgerEvent));
    const cashValue = accountId
      ? (cash.get(accountId) ?? 0)
      : [...cash.values()].reduce((sum, value) => sum + value, 0);
    const missingSymbols = valued
      .filter((position) => position.marketValue === null)
      .map((position) => position.symbol);
    const partial = missingSymbols.length > 0;
    const payload = {
      positions: valued,
      mode,
      knownMarketValue,
      totalMarketValue: partial ? null : knownMarketValue,
      partial,
      missingSymbols,
      dataQuality: {
        partial,
        missingSymbols,
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
    const currencies = [...new Set(accountCurrencyMap.values())] as Currency[];
    const fx = await this.resolveFx(currencies, options, new Date());
    const partialSnapshots = snapshots.filter(partialSnapshot);
    if (partialSnapshots.length > 0) {
      throw new BadRequestException({
        code: 'PARTIAL_PORTFOLIO_SNAPSHOT',
        message: '收益分析包含行情缺失的 partial snapshot，请补齐行情后重试',
        snapshotIds: partialSnapshots.flatMap((snapshot) => (snapshot.id ? [snapshot.id] : [])),
        missingSymbols: [...new Set(partialSnapshots.flatMap(snapshotMissingSymbols))],
      });
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
    const accountWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
    const externalEvents = (await this.prisma.ledgerEvent.findMany({
      where: {
        ...accountWhere,
        type: { in: [...EXTERNAL_FLOW_TYPES] },
        occurredAt: { gt: firstSnapshot.capturedAt, lte: lastSnapshot.capturedAt },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    })) as PerformanceLedgerEvent[];

    const convertFlow = (event: PerformanceLedgerEvent) => {
      const flow = externalPortfolioFlow(event);
      if (flow === 0 || !fx.meta.enabled || fx.meta.status === 'not_needed') return flow;
      const currency = event.accountId ? accountCurrencyMap.get(event.accountId) : undefined;
      const rate = currency ? fx.rates.get(currency) : undefined;
      return rate === undefined ? 0 : flow * rate;
    };

    const valuations = snapshots.map((snapshot, index) => {
      const previous = index === 0 ? undefined : snapshots[index - 1];
      const externalFlow = previous
        ? externalEvents.reduce((sum, event) => {
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
      where: { mode, active: true },
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
        Math.max(0, account.marketValue + account.cashValue),
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
        ...(accountId
          ? { accountId, account: { mode } }
          : useAccountSnapshots
            ? { accountId: { not: null }, account: { mode } }
            : { accountId: null }),
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
      .map((snapshot) => ({
        ...snapshot,
        currency: (snapshot.account?.currency ??
          (snapshot.accountId ? accountCurrencyMap.get(snapshot.accountId) : currencies[0]) ??
          'CNY') as Currency,
      }));
    if (!useAccountSnapshots) return filtered;
    if (!options.fxMerge) return this.groupSnapshotsByCurrency(filtered, mode);

    const fx = await this.resolveFx(currencies, options, new Date());
    if (fx.meta.status === 'blocked') return this.groupSnapshotsByCurrency(filtered, mode, fx.meta);

    const byAccount = new Map<string, typeof filtered>();
    for (const accountId of accountCurrencyMap.keys()) {
      if (!accountId.startsWith('__currency-')) byAccount.set(accountId, []);
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
      let included = 0;
      for (const accountSnapshots of byAccount.values()) {
        const point = [...accountSnapshots]
          .reverse()
          .find((snapshot) => snapshot.capturedAt.getTime() <= timestamp);
        if (!point) {
          partial = true;
          continue;
        }
        const rate = fx.rates.get(point.currency ?? 'CNY');
        if (rate === undefined) {
          partial = true;
          continue;
        }
        included += 1;
        marketValue += Number(point.marketValue) * rate;
        costValue += Number(point.costValue ?? 0) * rate;
        cashValue += Number(point.cashValue) * rate;
        missingSymbols.push(...snapshotMissingSymbols(point));
        partial ||= partialSnapshot(point);
      }
      if (included === 0) continue;
      merged.push({
        id: `fx-${timestamp}`,
        accountId: null,
        capturedAt: new Date(timestamp),
        marketValue,
        costValue,
        cashValue,
        ...(fx.meta.baseCurrency ? { currency: fx.meta.baseCurrency } : {}),
        payload: {
          mode,
          partial,
          missingSymbols: [...new Set(missingSymbols)],
          dataQuality: { partial, missingSymbols: [...new Set(missingSymbols)] },
          fx: fx.meta,
        },
        ...fxResponseFields(fx.meta),
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
      account: { mode },
    };
    const ledgerWhere = accountId ? { accountId, account: { mode } } : { account: { mode } };
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
    const ledger = storedLedger as PrismaLedgerEvent[];
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
        const currency = accountCurrencyMap.get(position.accountId) ?? 'CNY';
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
    const currencies = [
      ...new Set([...accountCurrencyMap.values(), ...securityNative.map((item) => item.currency)]),
    ] as Currency[];
    const fx = await this.resolveFx(currencies, options, valuedAt);
    const merged = fx.meta.enabled && fx.meta.status !== 'blocked';
    const security = securityNative.map((item) => {
      const marketValue =
        item.nativeMarketValue === null
          ? null
          : merged
            ? this.convertFx(item.nativeMarketValue, item.currency, fx)
            : item.nativeMarketValue;
      const costValue = merged
        ? this.convertFx(item.nativeCostValue, item.currency, fx)
        : item.nativeCostValue;
      return {
        accountId: item.accountId,
        symbol: item.symbol,
        assetType: item.assetType,
        currency: item.currency,
        nativeCostValue: item.nativeCostValue,
        nativeMarketValue: item.nativeMarketValue,
        costValue: costValue ?? item.nativeCostValue,
        marketValue,
        unrealizedPnl: marketValue === null || costValue === null ? null : marketValue - costValue,
      };
    });
    const cashBalances = projectCashBalance(ledger.map(toLedgerEvent));
    const byAccount = new Map<
      string,
      {
        currency: Currency;
        nativeCostValue: number;
        nativeMarketValue: number;
        nativeCashValue: number;
        partial: boolean;
        missingSymbols: string[];
      }
    >();
    for (const [id, currency] of accountCurrencyMap.entries()) {
      if (!id.startsWith('__currency-'))
        byAccount.set(id, {
          currency,
          nativeCostValue: 0,
          nativeMarketValue: 0,
          nativeCashValue: 0,
          partial: false,
          missingSymbols: [],
        });
    }
    for (const [id, cashValue] of cashBalances.entries()) {
      const current = byAccount.get(id) ?? {
        currency: accountCurrencyMap.get(id) ?? 'CNY',
        nativeCostValue: 0,
        nativeMarketValue: 0,
        nativeCashValue: 0,
        partial: false,
        missingSymbols: [],
      };
      current.nativeCashValue += cashValue;
      byAccount.set(id, current);
    }
    if (accountId && !byAccount.has(accountId)) {
      byAccount.set(accountId, {
        currency: accountCurrencyMap.get(accountId) ?? 'CNY',
        nativeCostValue: 0,
        nativeMarketValue: 0,
        nativeCashValue: 0,
        partial: false,
        missingSymbols: [],
      });
    }
    for (const item of securityNative) {
      const current = byAccount.get(item.accountId) ?? {
        currency: item.currency,
        nativeCostValue: 0,
        nativeMarketValue: 0,
        nativeCashValue: 0,
        partial: false,
        missingSymbols: [],
      };
      current.nativeCostValue += item.nativeCostValue;
      current.nativeMarketValue += item.nativeMarketValue ?? 0;
      if (item.nativeMarketValue === null) {
        current.partial = true;
        current.missingSymbols.push(item.symbol);
      }
      byAccount.set(item.accountId, current);
    }
    const account = [...byAccount.entries()].map(([id, value]) => {
      const costValue = merged
        ? this.convertFx(value.nativeCostValue, value.currency, fx)
        : value.nativeCostValue;
      const marketValue = merged
        ? this.convertFx(value.nativeMarketValue, value.currency, fx)
        : value.nativeMarketValue;
      const cashValue = merged
        ? this.convertFx(value.nativeCashValue, value.currency, fx)
        : value.nativeCashValue;
      return {
        accountId: id,
        currency: value.currency,
        nativeCostValue: value.nativeCostValue,
        nativeMarketValue: value.nativeMarketValue,
        nativeCashValue: value.nativeCashValue,
        costValue: costValue ?? value.nativeCostValue,
        marketValue: marketValue ?? value.nativeMarketValue,
        cashValue: cashValue ?? value.nativeCashValue,
        partial: value.partial,
        missingSymbols: [...new Set(value.missingSymbols)],
      };
    });
    const byCurrencyMap = new Map<
      Currency,
      {
        currency: Currency;
        nativeCostValue: number;
        nativeMarketValue: number;
        nativeCashValue: number;
        partial: boolean;
        missingSymbols: string[];
      }
    >();
    for (const currency of accountCurrencyMap.values()) {
      if (!byCurrencyMap.has(currency)) {
        byCurrencyMap.set(currency, {
          currency,
          nativeCostValue: 0,
          nativeMarketValue: 0,
          nativeCashValue: 0,
          partial: false,
          missingSymbols: [],
        });
      }
    }
    for (const value of byAccount.values()) {
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
            costValue: total.costValue + value.costValue,
            marketValue: total.marketValue + value.marketValue,
            cashValue: total.cashValue + value.cashValue,
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
            costValue: total.costValue + value.costValue,
            marketValue: total.marketValue + value.marketValue,
            cashValue: total.cashValue + value.cashValue,
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
        partial: portfolio?.partial ?? byCurrency.some((value) => value.partial),
        missingSymbols: [
          ...new Set(
            portfolio?.missingSymbols ?? byCurrency.flatMap((value) => value.missingSymbols),
          ),
        ],
      },
    };
  }
}
