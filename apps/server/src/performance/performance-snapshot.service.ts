import { BadRequestException, Injectable } from '@nestjs/common';
import { projectCashBalances } from '../ledger/cash-projection.js';
import {
  aggregateCurrencyAmounts,
  supportedCurrency,
  type ResolvedFx,
} from '../market/fx-conversion.js';
import { MarketService } from '../market/market.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { performanceRelationWhere, performanceSnapshotWhere } from './performance-account-scope.js';
import { PerformanceDataService } from './performance-data.service.js';
import { PerformanceSnapshotRevisionRepository } from './performance-snapshot-revision.repository.js';
import { valueSnapshotPosition } from './performance-snapshot-position-valuation.js';
import {
  fxResponseFields,
  partialSnapshot,
  snapshotMissingSymbols,
  snapshotMode,
  snapshotNativeByCurrency,
  snapshotPayload,
  type Currency,
  type NativeSnapshotCurrency,
  type PerformanceFxMeta,
  type PerformanceFxOptions,
  type PerformanceSnapshot,
  type PortfolioMode,
  type SnapshotCaptureContext,
} from './performance-types.js';

const shanghaiDate = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

const dateOnly = (value: Date) => new Date(`${shanghaiDate(value)}T00:00:00.000Z`);

@Injectable()
export class PerformanceSnapshotService {
  private readonly revisions: PerformanceSnapshotRevisionRepository;

  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    private readonly data: PerformanceDataService,
  ) {
    this.revisions = new PerformanceSnapshotRevisionRepository(prisma);
  }

  async capture(
    accountId?: string,
    capturedAt = new Date(),
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
    context: SnapshotCaptureContext = {},
  ) {
    const captureOptions = { ...options, fxMerge: options.fxMerge ?? true };
    const valuationDate = context.valuationDate ?? dateOnly(capturedAt);
    const valuationDateKey = shanghaiDate(valuationDate);
    await this.assertCurrencyScope(accountId, mode, captureOptions);
    const accountWhere = performanceRelationWhere(mode, accountId);
    const [positions, ledger, accountCurrencyMap] = await Promise.all([
      this.prisma.position.findMany({ where: accountWhere, include: { asset: true } }),
      this.prisma.ledgerEvent.findMany({
        where: accountWhere,
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.data.accountCurrencies(accountId, mode),
    ]);
    const baseCurrency =
      captureOptions.baseCurrency ??
      (accountId ? accountCurrencyMap.get(accountId) : undefined) ??
      'CNY';
    const resolvedCaptureOptions = { ...captureOptions, baseCurrency };
    const valued = await Promise.all(
      positions.map((position) => {
        const currency =
          supportedCurrency(position.asset.currency) ??
          accountCurrencyMap.get(position.accountId) ??
          baseCurrency;
        return valueSnapshotPosition(this.market, position, currency, valuationDateKey, context);
      }),
    );
    const cashBalances = projectCashBalances(ledger, capturedAt);
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
    const fx = await this.data.resolveFx(
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
      convertedAmount: this.data.convertFx(item.amount, item.currency, fx),
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
      dataQuality: { partial, missingSymbols, missingCurrencies },
    };
    const scope = accountId ? 'account' : 'portfolio';
    const source = context.source ?? 'DAILY_CLOSE';
    const valuationBasis = context.valuationBasis ?? 'ESTIMATED';
    const scopeId = accountId ?? 'all';
    const eventSuffix =
      source === 'DAILY_CLOSE' ? '' : `:${source}:${context.sourceRef ?? capturedAt.toISOString()}`;
    const slotKey = `${scope}:${scopeId}:${mode}:${valuationDateKey}${eventSuffix}`;
    const defaultKeyTime = source === 'DAILY_CLOSE' ? valuationDateKey : capturedAt.toISOString();
    const idempotencyKey =
      context.idempotencyKey ??
      `${source.toLowerCase()}:${scope}:${scopeId}:${mode}:${defaultKeyTime}:${valuationBasis.toLowerCase()}`;
    const pricedCoverage =
      context.pricedCoverage ??
      (valued.length === 0 ? 1 : (valued.length - missingSymbols.length) / valued.length);
    const disclosureCoverage = context.disclosureCoverage ?? 1;
    let valuationStatus: 'UNAVAILABLE' | 'PARTIAL' | 'COMPLETE' = 'COMPLETE';
    if (pricedCoverage === 0 && valued.length > 0) valuationStatus = 'UNAVAILABLE';
    else if (partial) valuationStatus = 'PARTIAL';
    if (valuationBasis === 'OFFICIAL' && valuationStatus !== 'COMPLETE') {
      throw new Error('正式估值所需行情、净值或汇率尚未齐备');
    }
    return this.revisions.appendCurrent({
      slotKey,
      idempotencyKey,
      valuationBasis,
      data: {
        ...(accountId ? { accountId } : {}),
        scope,
        mode,
        slotKey,
        capturedAt,
        valuationDate,
        source,
        ...(context.sourceRef ? { sourceRef: context.sourceRef } : {}),
        valuationBasis,
        status: 'VALID',
        valuationStatus,
        marketValue: knownMarketValue,
        costValue,
        cashValue,
        totalValue: knownMarketValue + cashValue,
        baseCurrency,
        disclosureCoverage,
        pricedCoverage,
        idempotencyKey,
        payloadVersion: 2,
        payload: {
          ...payload,
          snapshotAt: capturedAt.toISOString(),
          valuationDate: valuationDateKey,
          source,
          valuationBasis,
          disclosureCoverage,
          pricedCoverage,
        },
      },
    });
  }

  async history(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const accountCurrencyMap = await this.data.accountCurrencies(accountId, mode);
    const currencies = [...new Set([...accountCurrencyMap.values()])] as Currency[];
    const mixedCurrencyScope = !accountId && currencies.length > 1;
    const useAccountSnapshots = !accountId && mixedCurrencyScope;
    const snapshots = (await this.prisma.portfolioSnapshot.findMany({
      where: {
        ...performanceSnapshotWhere(accountId, useAccountSnapshots, mode),
        source: 'DAILY_CLOSE',
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
    const filtered = this.revisions
      .current(snapshots)
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
    const fxByDate = await this.data.resolveFxByDate(
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

  async list(filters: {
    accountId?: string;
    scope?: 'account' | 'portfolio';
    mode?: PortfolioMode;
    source?: 'DAILY_CLOSE' | 'TRANSACTION' | 'IMPORT' | 'SYSTEM';
    valuationBasis?: 'ESTIMATED' | 'OFFICIAL';
    start?: string;
    end?: string;
  }) {
    return this.revisions.list(filters);
  }

  async detail(id: string) {
    return this.revisions.detail(id);
  }

  async reconcileOfficial(limit = 100) {
    const estimates = await this.revisions.pendingEstimates(limit);
    const reconciled: string[] = [];
    const pending: Array<{ snapshotId: string; reason: string }> = [];
    for (const estimate of estimates) {
      try {
        const snapshot = await this.capture(
          estimate.accountId ?? undefined,
          estimate.capturedAt,
          estimate.mode === 'shadow' ? 'shadow' : 'actual',
          { fxMerge: true, baseCurrency: estimate.baseCurrency as Currency },
          {
            source: 'DAILY_CLOSE',
            sourceRef: `reconcile:${estimate.id}`,
            valuationBasis: 'OFFICIAL',
            valuationDate: estimate.valuationDate,
          },
        );
        reconciled.push(snapshot.id);
      } catch (error) {
        pending.push({
          snapshotId: estimate.id,
          reason: error instanceof Error ? error.message : '正式数据尚未齐备',
        });
      }
    }
    return { scanned: estimates.length, reconciled, pending };
  }

  private async assertCurrencyScope(
    accountId: string | undefined,
    mode: PortfolioMode,
    options: PerformanceFxOptions = {},
  ) {
    if (accountId || options.fxMerge === true) return;
    const accounts = await this.data.accountCurrencies(undefined, mode);
    const currencies = new Set(accounts.values());
    if (currencies.size > 1) {
      throw new BadRequestException({
        code: 'MIXED_CURRENCY_SCOPE',
        message: '当前范围包含多个币种，请选择单个账户后再分析',
        currencies: [...currencies],
      });
    }
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
}
