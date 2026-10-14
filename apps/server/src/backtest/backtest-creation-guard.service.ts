import { MarketLifecycleReaderV3 } from '../market/market-lifecycle-reader-v3.js';
import { lifecycleInputHashV3 } from './backtest-lifecycle-preparation-v3.js';
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  marketDataBarRouteKeyV3Schema,
  strategySchema,
  type BacktestRunCreateV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { MarketRouteRevisionService } from '../market/market-route-revision.service.js';
import { MarketAnnouncementPreparationService } from '../market/market-announcement-preparation.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { planBacktestPriceInputs } from './backtest-dependency-price.js';

import { preparationStale } from './backtest-preparation-fence.js';
import { BacktestKnownCashGuardV3 } from './backtest-known-cash-guard-v3.service.js';

@Injectable()
export class BacktestCreationGuardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
    @Inject(MarketAnnouncementPreparationService)
    private readonly announcements?: MarketAnnouncementPreparationService,
    @Optional()
    @Inject(MarketLifecycleReaderV3)
    private readonly lifecycle?: MarketLifecycleReaderV3,
    @Optional()
    @Inject(BacktestKnownCashGuardV3)
    private readonly knownCash?: BacktestKnownCashGuardV3,
  ) {}

  async check(request: BacktestRunCreateV3, strategy: BacktestStrategy): Promise<void> {
    const instrument = strategy.executionInstrument;
    if (
      strategy.execution.mode !== 'exchange' ||
      strategy.primaryTimeframe !== '1d' ||
      (instrument.assetType !== 'stock' && instrument.assetType !== 'etf')
    )
      preparationStale();
    if (
      request.runConfig.knownCashPreparation &&
      request.runConfig.knownCashPreparation.input.policy.entitlement !==
        'cn-etf-record-close-holdings-v2'
    )
      throw new ConflictException({
        code: 'LEGACY_CASH_ENTITLEMENT_REPREPARE',
        message: '旧分红资格版本须重新准备；新研究按登记日收盘成交持有份额计算。',
      });
    const stamp = request.preparationStamp;
    const version = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    const current = strategySchema.safeParse(version?.schema);
    if (
      !current.success ||
      version?.schemaVersion !== 2 ||
      stamp.strategyVersionId !== request.strategyVersionId ||
      stamp.strategyContentHash !== hashCanonicalManifest(strategy) ||
      stamp.strategyContentHash !== hashCanonicalManifest(current.data) ||
      stamp.runConfigChecksum !== hashCanonicalManifest(request.runConfig)
    )
      preparationStale();
    const plan = planBacktestPriceInputs(strategy, request.runConfig, {
      cashEventResearch: request.runConfig.executionPriceProtocol.cashEventResearch,
    });
    const routeKey = marketDataBarRouteKeyV3Schema.parse({
      kind: 'bar',
      market: instrument.market,
      assetType: instrument.assetType === 'stock' ? 'STOCK' : 'ETF',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: request.runConfig.executionPriceProtocol.priceBasis.adjustment,
    });
    const sequence = stamp.targetSequences[0];
    const requirement = {
      symbol: instrument.symbol,
      capability: 'DAILY_BAR',
      purpose: 'execution',
      dateRange: { startDate: plan.warmup.startDate, endDate: request.runConfig.endDate },
      routeKey,
    };
    if (
      stamp.targetSequences.length !== 1 ||
      !sequence ||
      !isDeepStrictEqual(sequence.requirement, requirement)
    )
      preparationStale();
    try {
      const currentRoute = await this.revisions.readCurrent(routeKey);
      if (
        stamp.desiredRevision !== currentRoute.desiredRevision ||
        stamp.effectiveRevision !== currentRoute.effectiveRevision ||
        stamp.catalogRevision !== currentRoute.catalogRevision ||
        !isDeepStrictEqual(sequence.targets, currentRoute.targetSources)
      )
        preparationStale();
    } catch {
      preparationStale();
    }
    const life = request.runConfig.lifecyclePreparation;
    if (life) {
      if (!this.lifecycle || lifecycleInputHashV3(life.response) !== life.inputHash)
        preparationStale();
      try {
        const current = await this.lifecycle.read({
          market: 'CN',
          symbol: instrument.symbol,
          start: life.response.range.start,
          end: life.response.range.end,
        });
        if (lifecycleInputHashV3(current) !== life.inputHash) preparationStale();
      } catch {
        preparationStale();
      }
    }
    const model = request.runConfig.executionModel;
    if (!model) preparationStale();
    if (request.runConfig.knownCashPreparation) {
      if (!this.knownCash) preparationStale();
      try {
        await this.knownCash.check(request.runConfig.knownCashPreparation);
      } catch {
        preparationStale();
      }
      return;
    }
    const progress = await this.announcements?.prepare({
      ...model.scope,
      start: request.runConfig.startDate,
      end: request.runConfig.endDate,
      historyBasis: request.runConfig.executionPriceProtocol.history.basis,
    });
    if (progress?.status === 'preparing')
      throw new ConflictException({
        code: 'ANNOUNCEMENT_DATA_PREPARING',
        message: '公告资料正在准备，请等待配置准备完成后再创建回测',
        progress,
      });
  }
}
