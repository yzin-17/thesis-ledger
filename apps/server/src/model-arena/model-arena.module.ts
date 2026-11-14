import { ArenaWeekStore } from './arena-week-store.js';
import { ArenaWeekWorker } from './arena-week-worker.js';
import { ArenaWeekProjector } from './arena-week-project.js';
import { ArenaWeekController } from './arena-week.controller.js';
import { ArenaComparisons } from './arena-comparison.js';
import { ArenaRoundReports } from './arena-round-report.js';
import { ArenaExecutionRunner } from './arena-execution-runner.js';
import { ArenaExecutionStore } from './arena-execution-store.js';
import { ArenaDecisionRunner } from './arena-decision-runner.js';
import { ArenaModelDecisions } from './arena-model-decisions.js';
import { ArenaResearchPackets } from './arena-research-packets.js';
import { ArenaSchedule } from './arena-schedule.js';
import { ArenaRoundWorker } from './arena-round-worker.js';
import { MarketModule } from '../market/market.module.js';
import { AiModule } from '../ai/ai.module.js';
import { Module } from '@nestjs/common';
import { ArenaLiveModule } from './live/arena-live.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ModelArenaController } from './model-arena.controller.js';
import { ModelArenaRepository } from './model-arena.repository.js';
import { ArenaRoundAdmission } from './arena-round-admission.js';
@Module({
  imports: [IdentityModule, MarketModule, AiModule, ArenaLiveModule],
  controllers: [ModelArenaController, ArenaWeekController],
  providers: [
    ArenaWeekProjector,
    ArenaWeekStore,
    ArenaWeekWorker,
    ArenaComparisons,
    ArenaRoundReports,
    ArenaExecutionRunner,
    ArenaExecutionStore,
    ArenaDecisionRunner,
    ArenaModelDecisions,
    ArenaResearchPackets,
    ModelArenaRepository,
    ArenaRoundAdmission,
    ArenaSchedule,
    ArenaRoundWorker,
  ],
})
export class ModelArenaModule {}
