import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { AssetMatcherService } from './asset-matcher.service.js';
import { ImportCommitService } from './import-commit.service.js';
import { ImportController } from './import.controller.js';
import { ImportDraftService } from './import-draft.service.js';
import { ImportRollbackService } from './import-rollback.service.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [ImportController],
  providers: [
    AssetMatcherService,
    ImportDraftService,
    ImportCommitService,
    ImportRollbackService,
    ImportService,
  ],
  exports: [ImportService, ImportDraftService, ImportCommitService, ImportRollbackService],
})
export class ImportModule {}
