import { Body, Controller, Inject, Post } from '@nestjs/common';
import { OptimizationPreparation } from './optimization-preparation.js';

@Controller('strategy-optimization/run-config')
export class StrategyOptimizationPreparationController {
  constructor(@Inject(OptimizationPreparation) private readonly preparation: OptimizationPreparation) {}
  @Post('prepare')
  prepare(@Body() body: unknown) { return this.preparation.prepare(body); }
}
