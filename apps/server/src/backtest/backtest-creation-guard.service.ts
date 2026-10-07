import { Inject, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import {
  marketDataBarRouteKeyV3Schema,
  strategySchema,
  type BacktestRunCreateV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { MarketRouteRevisionService } from '../market/market-route-revision.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { planBacktestPriceInputs } from './backtest-dependency-price.js';

import { preparationStale } from './backtest-preparation-fence.js';

@Injectable()
export class BacktestCreationGuardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
  ) {}

  async check(request: BacktestRunCreateV3, strategy: BacktestStrategy): Promise<void> {
    const instrument = strategy.executionInstrument;
    if (
      strategy.execution.mode !== 'exchange' ||
      strategy.primaryTimeframe !== '1d' ||
      (instrument.assetType !== 'stock' && instrument.assetType !== 'etf')
    )
      preparationStale();
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
    const plan = planBacktestPriceInputs(strategy, request.runConfig);
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
  }
}
