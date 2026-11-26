import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  optimizationRunPreparationRequestSchema,
  optimizationRunPreparationResultSchema,
} from '@thesis-ledger/schemas';
import { BacktestRunPreparationService } from '../backtest/backtest-run-preparation.service.js';
import { createDiscoverySeed } from './strategy-optimization-discovery.js';

@Injectable()
export class OptimizationPreparation {
  constructor(
    @Inject(BacktestRunPreparationService)
    private readonly preparation: BacktestRunPreparationService,
  ) {}

  async prepare(body: unknown) {
    const { target, intent } = optimizationRunPreparationRequestSchema.parse(body);
    if (!intent.priceResearch)
      throw new BadRequestException('新实验统一使用后复权研究，请重新准备研究配置。');
    const preparation = target.sourceMode === 'discovery' && !intent.priceResearchReference
      ? { ...intent, priceResearchReference: 'optional' as const } : intent;
    const result =
      target.sourceMode === 'existing'
        ? await this.preparation.prepare({ ...preparation, strategyVersionId: target.strategyVersionId })
        : await this.preparation.prepareDraft(preparation, createDiscoverySeed(target.discoveryScope, true));
    const base = {
      contractVersion: 1,
      requestId: result.requestId,
      checkedAt: result.checkedAt,
      scope: 'baseline-window',
    };
    if (result.status === 'blocked')
      return optimizationRunPreparationResultSchema.parse({
        ...base,
        status: 'blocked',
        diagnostics: result.diagnostics,
      });
    if (result.status === 'preparing') return optimizationRunPreparationResultSchema.parse({
      ...base, status: 'preparing', announcementPreparation: result.announcementPreparation,
    });
    const strategyContentHash =
      'strategyContentHash' in result
        ? result.strategyContentHash
        : result.executionPreflight.revisionStamp?.strategyContentHash;
    const revisions =
      'routeRevisions' in result ? result.routeRevisions : result.executionPreflight.revisionStamp;
    return optimizationRunPreparationResultSchema.parse({
      ...base,
      status: 'prepared',
      runConfig: result.runConfig,
      actualSource: result.actualSource,
      ...(result.actualPriceSource ? { actualPriceSource: result.actualPriceSource } : {}),
      ...('announcementPreparation' in result ? { announcementPreparation: result.announcementPreparation } : {}),
      strategyContentHash,
      routeRevisions: revisions && {
        desiredRevision: revisions.desiredRevision,
        effectiveRevision: revisions.effectiveRevision,
        catalogRevision: revisions.catalogRevision,
      },
    });
  }
}
