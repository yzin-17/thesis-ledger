import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { optimizationModelResolutionRequestSchema } from '@thesis-ledger/schemas';
import {
  CurrentStrategyOwner,
  StrategyIdentityGuard,
} from '../backtest/strategy-identity.guard.js';
import { StrategyAccessService } from '../backtest/strategy-access.service.js';
import { OptimizationPreparation } from './optimization-preparation.js';
import { OptimizationModelResolution } from './optimization-model-resolution.js';

@Controller('strategy-optimization/run-config')
export class StrategyOptimizationPreparationController {
  constructor(
    @Inject(OptimizationPreparation) private readonly preparation: OptimizationPreparation,
    @Inject(OptimizationModelResolution) private readonly models: OptimizationModelResolution,
    @Inject(StrategyAccessService) private readonly access: StrategyAccessService,
  ) {}
  @Post('execution-model')
  @UseGuards(StrategyIdentityGuard)
  async resolveModel(@Body() body: unknown, @CurrentStrategyOwner() owner: string | null) {
    const request = optimizationModelResolutionRequestSchema.parse(body);
    if (request.target.sourceMode === 'existing')
      await this.access.version(request.target.strategyVersionId, owner);
    return this.models.resolve(request);
  }
  @Post('prepare')
  prepare(@Body() body: unknown) {
    return this.preparation.prepare(body);
  }
}
