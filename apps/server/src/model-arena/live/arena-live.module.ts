import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module.js';
import { MarketModule } from '../../market/market.module.js';
import { AiModule } from '../../ai/ai.module.js';
import { LiveMatchesRepository } from './live-matches.repository.js';
import { LiveMatchesQuery } from './live-matches.query.js';
import { LiveMatchesController } from './live-matches.controller.js';
import { LiveAppointments } from './live-appointments.js';
import { LiveCyclesRepository } from './live-cycles.repository.js';
import { LiveExecutionContext } from './live-execution-context.js';
import { LiveOrdersRepository } from './live-orders.repository.js';
import { LiveResearchBudget } from './live-research-budget.js';
import { LiveResearchCall } from './live-research-call.js';
import { LiveResearchTools } from './live-research-tools.js';
import { LiveResearchRunner } from './live-research-runner.js';
import { LiveValuations } from './live-valuations.js';
import { LiveRuntime } from './live-runtime.js';
import { LiveMatchesCatalog } from './live-matches-catalog.js';
import { LiveReplayRuntime } from './live-replay-runtime.js';

@Module({
  imports: [IdentityModule, MarketModule, AiModule],
  controllers: [LiveMatchesController],
  providers: [LiveMatchesRepository, LiveMatchesQuery, LiveAppointments, LiveCyclesRepository,
    LiveExecutionContext, LiveOrdersRepository, LiveResearchBudget, LiveResearchCall,
    LiveResearchTools, LiveResearchRunner, LiveValuations, LiveRuntime, LiveMatchesCatalog, LiveReplayRuntime],
})
export class ArenaLiveModule {}
