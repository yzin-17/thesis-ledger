import { Injectable } from '@nestjs/common';
import { BaselineImportService } from '../ledger/baseline-import.service.js';
import type { ImportDraftOptions } from './import-draft.service.js';
import type { ScreenshotSource } from './screenshot-source.js';

@Injectable()
export class ImportCommitService {
  constructor(private readonly baselineImport: BaselineImportService) {}

  commit(
    id: string,
    reviewedRows: unknown[],
    reviewedSource?: ScreenshotSource,
    temporal?: ImportDraftOptions,
  ) {
    return this.baselineImport.commitReviewedImport(id, reviewedRows, reviewedSource, temporal);
  }
}
