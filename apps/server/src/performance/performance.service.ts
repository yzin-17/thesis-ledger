import { Injectable, Optional } from '@nestjs/common';
import { MarketService } from '../market/market.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { PerformanceAnalysisService } from './performance-analysis.service.js';
import { PerformanceDataService } from './performance-data.service.js';
import { PerformanceLayerService } from './performance-layer.service.js';
import { PerformanceSnapshotService } from './performance-snapshot.service.js';
import { PerformanceTargetService } from './performance-target.service.js';
import type { PerformanceFxOptions, PortfolioMode } from './performance-types.js';

@Injectable()
export class PerformanceService {
  private readonly snapshotService: PerformanceSnapshotService;
  private readonly analysisService: PerformanceAnalysisService;
  private readonly layerService: PerformanceLayerService;
  private readonly targetService: PerformanceTargetService;

  constructor(
    prisma: PrismaService,
    market: MarketService,
    @Optional() snapshots?: PerformanceSnapshotService,
    @Optional() analysis?: PerformanceAnalysisService,
    @Optional() layers?: PerformanceLayerService,
    @Optional() targets?: PerformanceTargetService,
    @Optional() data?: PerformanceDataService,
  ) {
    const performanceData = data ?? new PerformanceDataService(prisma, market);
    this.snapshotService =
      snapshots ?? new PerformanceSnapshotService(prisma, market, performanceData);
    this.layerService = layers ?? new PerformanceLayerService(prisma, market, performanceData);
    this.analysisService =
      analysis ?? new PerformanceAnalysisService(prisma, performanceData, this.snapshotService);
    this.targetService = targets ?? new PerformanceTargetService(prisma, this.layerService);
  }

  capture(
    accountId?: string,
    capturedAt = new Date(),
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    return this.snapshotService.capture(accountId, capturedAt, mode, options);
  }

  history(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    return this.snapshotService.history(accountId, start, end, mode, options);
  }

  summary(
    accountId?: string,
    start?: string,
    end?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    return this.analysisService.summary(accountId, start, end, mode, options);
  }

  calculate(input: {
    valuations: { date: string; value: number; externalFlow?: number }[];
    cashFlows: { date: string; amount: number }[];
  }) {
    return this.analysisService.calculate(input);
  }

  allocate(input: {
    positions: { category: string; marketValue: number }[];
    targets?: Record<string, number>;
    dataQuality?: { partial: boolean; missingSymbols: string[] };
  }) {
    return this.analysisService.allocate(input);
  }

  layers(
    accountId?: string,
    symbol?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    return this.layerService.layers(accountId, symbol, mode, options);
  }

  targets(
    scope: 'account' | 'portfolio',
    accountId?: string,
    mode: PortfolioMode = 'actual',
    options: PerformanceFxOptions = {},
  ) {
    return this.targetService.targets(scope, accountId, mode, options);
  }

  saveTargets(scope: 'account' | 'portfolio', targets: Record<string, number>, accountId?: string) {
    return this.targetService.saveTargets(scope, targets, accountId);
  }
}
