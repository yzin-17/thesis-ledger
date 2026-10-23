import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { MarketModule } from '../market/market.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ResearchScopeReader } from './research-scope-reader.js';
import { ResearchSubmissionService } from './research-submission.service.js';
import { ResearchController } from './research.controller.js';
import { ResearchReportsController } from './research-reports.controller.js';
import { ResearchObservationStore } from './research-observation.store.js';
import { ResearchObservationAccess } from './research-observation-access.js';
import { ResearchObservationMaterials } from './research-observation-materials.js';
import { ResearchObservationService } from './research-observation.service.js';
import { ResearchObservationQueries } from './research-observation.queries.js';
import { ResearchObservationsController } from './research-observations.controller.js';

@Module({
  imports: [IdentityModule, MarketModule, AiModule],
  controllers: [ResearchController, ResearchReportsController, ResearchObservationsController],
  providers: [
    ResearchScopeReader,
    ResearchSubmissionService,
    ResearchObservationStore,
    ResearchObservationAccess,
    ResearchObservationMaterials,
    ResearchObservationService,
    ResearchObservationQueries,
  ],
})
export class ResearchModule {}
