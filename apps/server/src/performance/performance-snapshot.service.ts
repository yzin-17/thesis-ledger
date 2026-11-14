import {
  snapshotNativeCurrencies,
  snapshotCaptureIdentity,
  mergeAccountSnapshotHistory,
} from './performance-snapshot-aggregation.js';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  aggregateCurrencyAmounts,
  supportedCurrency,
  type ResolvedFx,
} from '../market/fx-conversion.js';
import { MarketService } from '../market/market.service.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { PrismaService } from '../platform/prisma.service.js';
import { performanceSnapshotWhere } from './performance-account-scope.js';
import { PerformanceDataService } from './performance-data.service.js';
import { PerformanceSnapshotRevisionRepository } from './performance-snapshot-revision.repository.js';
import { valueSnapshotPosition } from './performance-snapshot-position-valuation.js';
import {
  frozenSnapshotInputs,
  readCurrentSnapshotInputs,
  type SnapshotEconomicInputs,
} from './performance-snapshot-inputs.js';
import {
  fxResponseFields,
  partialSnapshot,
  snapshotMissingSymbols,
  snapshotMode,
  snapshotNativeByCurrency,
  snapshotPayload,
  type Currency,
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
    @Optional() private readonly bars?: MarketBarReader,
  ) {
    this.revisions = new PerformanceSnapshotRevisionRepository(prisma);
  }

  async capture(
    accountId?: string,
    capturedAt = new Date(),
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
    context: SnapshotCaptureContext = {},
    frozenInputs?: SnapshotEconomicInputs,
  ) {
    const captureOptions = { ...options, fxMerge: options.fxMerge ?? true };
    const valuationDate = context.valuationDate ?? dateOnly(capturedAt);
    const valuationDateKey = shanghaiDate(valuationDate);
    await this.assertCurrencyScope(accountId, mode, captureOptions);
    const inputs =
      frozenInputs ??
      (await readCurrentSnapshotInputs(
        this.prisma,
        this.data,
        accountId,
        capturedAt,
        mode,
        captureOptions.baseCurrency,
      ));
    const baseCurrency = inputs.baseCurrency;
    const resolvedCaptureOptions = { ...captureOptions, baseCurrency };
    const valued = await Promise.all(
      inputs.positions.map((position) =>
        valueSnapshotPosition(
          this.market,
          { ...position, asset: { assetType: position.assetType } },
          position.currency,
          valuationDateKey,
          context,
          this.bars,
        ),
      ),
    );
    const cashAmounts = inputs.cashAmounts;
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
    const nativeByCurrency = snapshotNativeCurrencies(valued, cashAmounts);
    const cashByCurrency = cashAmounts.map((item) => ({
      ...item,
      convertedAmount: this.data.convertFx(item.amount, item.currency, fx),
    }));
    const payload = {
      positions: valued,
      mode,
      accountScopePolicy: inputs.accountScopePolicy,
      ...(inputs.accountIds ? { accountIds: inputs.accountIds } : {}),
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
    const {
      scope,
      source,
      valuationBasis,
      slotKey,
      evidenceVersion,
      idempotencyKey,
      pricedCoverage,
      disclosureCoverage,
      valuationStatus,
    } = snapshotCaptureIdentity({
      accountId,
      capturedAt,
      mode,
      valuationDateKey,
      context,
      inputs,
      valued,
      fx: fx.meta,
      partial,
      missingSymbols,
    });
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
          ...(evidenceVersion ? { evidenceVersion } : {}),
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

    return mergeAccountSnapshotHistory(filtered, accountCurrencyMap, fxByDate, mode, withFx);
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

  async reconcileOfficial(limit = 100, accountId?: string) {
    const estimates = await this.revisions.pendingEstimates(limit, accountId);
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
          frozenSnapshotInputs(estimate),
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
