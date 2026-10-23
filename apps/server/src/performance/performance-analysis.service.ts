import { BadRequestException, Injectable } from '@nestjs/common';
import {
  allocation,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
  rebalanceGap,
  ttwror,
  xirr,
  type ValuationPoint,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { performanceRelationWhere, incompatibleAccountScopeSummary } from './performance-account-scope.js';
import { PerformanceDataService } from './performance-data.service.js';
import { externalPortfolioFlow, internalPortfolioTransfer } from './performance-ledger-flow.js';
import { performanceReturnValuations } from './performance-return-valuations.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import {
  fxResponseFields,
  partialSnapshot,
  snapshotFxMeta,
  snapshotMissingSymbols,
  snapshotValue,
  type Currency,
  type PerformanceFxMeta,
  type PerformanceFxOptions,
  type PerformanceLedgerEvent,
  type PortfolioMode,
} from './performance-types.js';
import type { ResolvedFx } from '../market/fx-conversion.js';

@Injectable()
export class PerformanceAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: PerformanceDataService,
    private readonly snapshots: PerformanceSnapshotService,
  ) {}

  async summary(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    const snapshots = await this.snapshots.history(accountId, start, end, mode, options);
    const accountCurrencyMap = await this.data.accountCurrencies(accountId, mode);
    const currencies = [
      ...new Set([
        ...accountCurrencyMap.values(),
        ...snapshots.flatMap((snapshot) =>
          snapshot.currency === undefined ? [] : [snapshot.currency],
        ),
      ]),
    ] as Currency[];
    const fx = await this.data.resolveFx(currencies, options, new Date());
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
      .filter((snapshotFx): snapshotFx is PerformanceFxMeta => snapshotFx !== undefined);
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
        ttwrorReason: '无法获取完整历史汇率，暂时无法计算本位币收益',
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
        ttwrorReason: '至少需要两个完整快照',
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
        ttwrorReason: '混合币种未合并，收益请按币种查看',
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
        ttwrorReason: '无法获取有效汇率，暂时无法计算合并收益',
        fx: fx.meta,
        ...fxResponseFields(fx.meta),
      };
    }

    const firstSnapshot = snapshots[0]!;
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const accountWhere = performanceRelationWhere(mode, accountId);
    const scopedEvents = (await this.prisma.ledgerEvent.findMany({
      where: {
        ...accountWhere,
        type: 'CASH_FLOW',
        occurredAt: { gt: firstSnapshot.capturedAt, lte: lastSnapshot.capturedAt },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    })) as PerformanceLedgerEvent[];
    const accountIds = new Set(accountCurrencyMap.keys());
    const externalEvents = scopedEvents.filter((event) => accountId || !internalPortfolioTransfer(event, accountIds));
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
      ? await this.data.resolveFxByDate(
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
        ttwrorReason: '无法获取完整历史汇率，暂时无法计算本位币收益',
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
      if (!eventFx) throw new BadRequestException('现金流时点缺少历史汇率证据');
      const converted = this.data.convertFx(flow.amount, currency, eventFx);
      if (converted === null) throw new BadRequestException('现金流币种缺少历史汇率，不得补零');
      return converted;
    };
    const valuations = performanceReturnValuations(snapshots, externalEvents, convertFlow);
    const cashFlows = [
      { date: firstSnapshot.capturedAt.toISOString(), amount: -snapshotValue(firstSnapshot) },
      ...externalEvents.flatMap((event) => {
        if (event.occurredAt === null) return [];
        const portfolioFlow = convertFlow(event);
        return portfolioFlow === 0
          ? []
          : [{ date: event.occurredAt.toISOString(), amount: -portfolioFlow }];
      }),
      { date: lastSnapshot.capturedAt.toISOString(), amount: snapshotValue(lastSnapshot) },
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

  calculate(input: {
    valuations: ValuationPoint[];
    cashFlows: { date: string; amount: number }[];
  }) {
    let moneyWeightedReturn: number | null = null;
    let xirrReason: string | null = null;
    let timeWeightedReturn: number | null = null;
    let ttwrorReason: string | null = null;
    try {
      timeWeightedReturn = ttwror(input.valuations);
    } catch (error) {
      ttwrorReason = error instanceof Error ? error.message : '时间加权收益率无法计算';
    }
    try {
      moneyWeightedReturn = xirr(input.cashFlows);
    } catch (error) {
      xirrReason = error instanceof Error ? error.message : '资金加权收益率无法计算';
    }
    return { ttwror: timeWeightedReturn, ttwrorReason, xirr: moneyWeightedReturn, xirrReason };
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
    const total = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const unavailable = partial || !Number.isFinite(total) || total <= 0;
    return {
      allocation: unavailable
        ? calculatedAllocation.map((item) => ({ ...item, weight: null }))
        : calculatedAllocation,
      rebalance: unavailable || !targets ? [] : rebalanceGap(positions, targets),
      rebalanceUnavailableReason: unavailable ? '估值、汇率或市值分母不完整，无法提供完整再平衡建议' : null,
      partial,
      missingSymbols,
    };
  }
}
