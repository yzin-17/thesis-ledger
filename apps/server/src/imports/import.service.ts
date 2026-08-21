import { Injectable, Optional } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { AssetMatcherService } from './asset-matcher.service.js';
import { ImportCommitService } from './import-commit.service.js';
import { ImportDraftService } from './import-draft.service.js';
import { ImportRollbackService } from './import-rollback.service.js';
import type { ScreenshotSource } from './screenshot-source.js';
import type { PositionVisionProvider, VisionPosition } from './vision-validation.js';

export { detectScreenshotSource, type ScreenshotSource } from './screenshot-source.js';
export {
  validateVisionPosition,
  type PositionVisionProvider,
  type VisionPosition,
} from './vision-validation.js';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ledger?: LedgerService,
    @Optional() private readonly matcher?: AssetMatcherService,
    @Optional() private readonly drafts?: ImportDraftService,
    @Optional() private readonly commits?: ImportCommitService,
    @Optional() private readonly rollbacks?: ImportRollbackService,
  ) {}

  private assetMatcher() {
    return this.matcher ?? new AssetMatcherService(this.prisma);
  }

  private draftService() {
    return this.drafts ?? new ImportDraftService(this.prisma, this.assetMatcher());
  }

  private commitService() {
    return this.commits ?? new ImportCommitService(this.prisma, this.ledger);
  }

  private rollbackService() {
    return this.rollbacks ?? new ImportRollbackService(this.prisma, this.ledger);
  }

  createDraftFromProvider(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    provider: PositionVisionProvider,
    sourceConfidence?: number,
  ) {
    return this.draftService().createDraftFromProvider(
      accountId,
      image,
      source,
      provider,
      sourceConfidence,
    );
  }

  matchAsset(row: VisionPosition) {
    return this.assetMatcher().matchAsset(row);
  }

  createDraft(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    extracted: VisionPosition[],
    sourceConfidence?: number,
  ) {
    return this.draftService().createDraft(accountId, image, source, extracted, sourceConfidence);
  }

  rebaseline(id: string) {
    return this.draftService().rebaseline(id);
  }

  commit(id: string, reviewedRows: unknown[], reviewedSource?: ScreenshotSource) {
    return this.commitService().commit(id, reviewedRows, reviewedSource);
  }

  history(accountId: string) {
    return this.draftService().history(accountId);
  }

  rollback(id: string) {
    return this.rollbackService().rollback(id);
  }
}
