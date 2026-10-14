import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  optimizationRunPreparationRequestSchema,
  optimizationRunPreparationResultSchema,
} from '@thesis-ledger/schemas';
import { BacktestRunPreparationService } from '../backtest/backtest-run-preparation.service.js';
import { createDiscoverySeed } from './strategy-optimization-discovery.js';

@Controller('strategy-optimization/run-config')
export class StrategyOptimizationPreparationController {
  constructor(
    @Inject(BacktestRunPreparationService)
    private readonly preparation: BacktestRunPreparationService,
  ) {}

  @Post('prepare')
  async prepare(@Body() body: unknown) {
    const { target, intent } = optimizationRunPreparationRequestSchema.parse(body);
    const result =
      target.sourceMode === 'existing'
        ? await this.preparation.prepare({ ...intent, strategyVersionId: target.strategyVersionId })
        : await this.preparation.prepareDraft(intent, createDiscoverySeed(target.discoveryScope));
    const base = {
      contractVersion: 3,
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
