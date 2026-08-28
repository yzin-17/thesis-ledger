import { Injectable } from '@nestjs/common';
import { AssetMatcherService } from './asset-matcher.service.js';
import { ImportCommitService } from './import-commit.service.js';
import { ImportDraftService, type ImportDraftOptions } from './import-draft.service.js';
import { ImportRollbackService } from './import-rollback.service.js';
import type { ScreenshotSource } from './screenshot-source.js';
import type { PositionVisionProvider, VisionPosition } from './vision-validation.js';

export { detectScreenshotSource, type ScreenshotSource } from './screenshot-source.js';
export type { ImportDraftOptions } from './import-draft.service.js';
export {
  validateVisionPosition,
  type PositionVisionProvider,
  type VisionPosition,
} from './vision-validation.js';

@Injectable()
export class ImportService {
  constructor(
    private readonly matcher: AssetMatcherService,
    private readonly drafts: ImportDraftService,
    private readonly commits: ImportCommitService,
    private readonly rollbacks: ImportRollbackService,
  ) {}

  createDraftFromProvider(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    provider: PositionVisionProvider,
    sourceConfidence?: number,
    temporal?: ImportDraftOptions,
  ) {
    return this.drafts.createDraftFromProvider(
      accountId,
      image,
      source,
      provider,
      sourceConfidence,
      temporal,
    );
  }

  matchAsset(row: VisionPosition) {
    return this.matcher.matchAsset(row);
  }

  createDraft(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    extracted: VisionPosition[],
    sourceConfidence?: number,
    temporal?: ImportDraftOptions,
  ) {
    return this.drafts.createDraft(accountId, image, source, extracted, sourceConfidence, temporal);
  }

  rebaseline(id: string) {
    return this.drafts.rebaseline(id);
  }

  async commit(
    id: string,
    reviewedRows: unknown[],
    reviewedSource?: ScreenshotSource,
    temporal?: ImportDraftOptions,
  ) {
    return this.commits.commit(id, reviewedRows, reviewedSource, temporal);
  }

  history(accountId: string) {
    return this.drafts.history(accountId);
  }

  rollback(id: string) {
    return this.rollbacks.rollback(id);
  }
}
