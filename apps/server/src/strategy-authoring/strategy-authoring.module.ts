import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PrismaService } from '../platform/prisma.service.js';
import { AuthoringDraftRepository } from './authoring-draft.repository.js';
import { AuthoringDraftController } from './authoring-draft.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [AuthoringDraftController],
  providers: [
    {
      provide: AuthoringDraftRepository,
      inject: [PrismaService],
      useFactory: (database: PrismaService) => new AuthoringDraftRepository(database),
    },
  ],
  exports: [AuthoringDraftRepository],
})
export class StrategyAuthoringModule {}
