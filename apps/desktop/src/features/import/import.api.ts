import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type { ImportDraftRecord, ImportRow } from './import.types.js';

const noStore = { cache: 'no-store' as const };

export const fetchImportDrafts = (accountId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<ImportDraftRecord[]>(
    `/imports?accountId=${encodeURIComponent(accountId)}`,
    noStore,
    client,
  );

export const uploadScreenshotImport = (
  input: { file: File; accountId: string; source: ImportDraftRecord['source'] },
  client?: DesktopRequestClient,
) => {
  const body = new FormData();
  body.set('file', input.file);
  body.set('accountId', input.accountId);
  body.set('source', input.source);
  body.set('sourceConfidence', input.source === 'unknown' ? '0' : '1');
  body.set('extracted', '[]');
  return requestDesktopJson<ImportDraftRecord>(
    '/imports/screenshot',
    {
      ...noStore,
      method: 'POST',
      body,
    },
    client,
  );
};

export const commitImportDraft = (
  draftId: string,
  input: { rows: ImportRow[]; source: ImportDraftRecord['source'] },
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<unknown>(
    `/imports/${encodeURIComponent(draftId)}/commit`,
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const rollbackImportDraft = (draftId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    `/imports/${encodeURIComponent(draftId)}/rollback`,
    {
      ...noStore,
      method: 'POST',
    },
    client,
  );
