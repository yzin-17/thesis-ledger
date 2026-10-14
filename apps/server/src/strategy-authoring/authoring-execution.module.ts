import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { MarketModule } from '../market/market.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PrismaService } from '../platform/prisma.service.js';
import { StrategyAuthoringModule } from './strategy-authoring.module.js';
import { AuthoringOperationRepository } from './authoring-operation.repository.js';
import { AuthoringOperationController } from './authoring-operation.controller.js';
import { AuthoringQueue } from './authoring-queue.js';
import { AuthoringExecutor } from './authoring.executor.js';
import { AuthoringWorker } from './authoring.worker.js';
import { AuthoringSubmitService } from './authoring-submit.service.js';
import { AuthoringAnalysisRepository } from './authoring-analysis.repository.js';
import { AuthoringDraftRepository } from './authoring-draft.repository.js';
import { AuthoringResultRepository } from './authoring-result.repository.js';
import { BacktestModule } from '../backtest/backtest.module.js';
import { StrategyCreationService } from '../backtest/strategy-creation.service.js';
import { InstrumentService } from '../market/instrument.service.js';
import { AuthoringProvenanceRepository } from './authoring-provenance.repository.js';
import { AuthoringSaveService } from './authoring-save.service.js';
import { AuthoringSaveController } from './authoring-save.controller.js';
import { AuthoringProposalService } from './authoring-proposal.service.js';
import { AuthoringProposalController } from './authoring-proposal.controller.js';
import { AuthoringOperationHistoryRepository } from './authoring-operation-history.repository.js';
import { AuthoringOperationHistoryController } from './authoring-operation-history.controller.js';

@Module({
  imports: [IdentityModule, StrategyAuthoringModule, AiModule, MarketModule, BacktestModule],
  controllers: [
    AuthoringOperationController,
    AuthoringSaveController,
    AuthoringProposalController,
    AuthoringOperationHistoryController,
  ],
  providers: [
    {
      provide: AuthoringOperationHistoryRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new AuthoringOperationHistoryRepository(db),
    },
    {
      provide: AuthoringProposalService,
      inject: [
        PrismaService,
        AuthoringOperationRepository,
        AuthoringProvenanceRepository,
        AuthoringDraftRepository,
      ],
      useFactory: (
        db: PrismaService,
        operations: AuthoringOperationRepository,
        sources: AuthoringProvenanceRepository,
        drafts: AuthoringDraftRepository,
      ) => new AuthoringProposalService(db, operations, sources, drafts),
    },
    {
      provide: AuthoringProvenanceRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new AuthoringProvenanceRepository(db),
    },
    {
      provide: AuthoringSaveService,
      inject: [
        PrismaService,
        StrategyCreationService,
        AuthoringProvenanceRepository,
        InstrumentService,
      ],
      useFactory: (
        db: PrismaService,
        creation: StrategyCreationService,
        sources: AuthoringProvenanceRepository,
        instruments: InstrumentService,
      ) => new AuthoringSaveService(db, creation, sources, instruments),
    },
    {
      provide: AuthoringOperationRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new AuthoringOperationRepository(db),
    },
    {
      provide: AuthoringAnalysisRepository,
      inject: [PrismaService, AuthoringDraftRepository],
      useFactory: (db: PrismaService, drafts: AuthoringDraftRepository) =>
        new AuthoringAnalysisRepository(db, drafts),
    },
    {
      provide: AuthoringResultRepository,
      inject: [PrismaService, AuthoringDraftRepository],
      useFactory: (db: PrismaService, drafts: AuthoringDraftRepository) =>
        new AuthoringResultRepository(db, drafts),
    },
    AuthoringQueue,
    AuthoringExecutor,
    AuthoringWorker,
    AuthoringSubmitService,
  ],
  exports: [AuthoringOperationRepository, AuthoringExecutor],
})
export class AuthoringExecutionModule {}
