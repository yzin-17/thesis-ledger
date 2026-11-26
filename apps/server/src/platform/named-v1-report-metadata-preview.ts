import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  correlateReportMetadata,
  reportMetadataCurrentRevisions,
  reportMetadataRequestSchema,
} from '@thesis-ledger/schemas';
import { canonicalizeManifest } from '../backtest/backtest-snapshot.js';

const object = z.record(z.string(), z.unknown());
const rowSchema = z.object({
  id: z.uuid(), instrumentId: z.uuid(), symbol: z.string(), contentHash: z.string(),
  payload: z.strictObject({ request: object, page: object }),
});
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function convertReportMetadata(raw: unknown) {
  const { id, instrumentId, symbol, contentHash, payload } = rowSchema.parse(raw);
  const version = payload.page.metadataVersion;
  if (payload.request.contractVersion !== 3 || payload.page.contractVersion !== 3 ||
      (version !== 'research-report-metadata-v1' && version !== 'research-report-metadata-v2'))
    return { id, instrumentId, version, outcome: 'unproven', reason: '原快照版本不明' };
  try {
    const request = reportMetadataRequestSchema.parse({ ...payload.request, contractVersion: 1 });
    const page = correlateReportMetadata(request, {
      ...payload.page,
      contractVersion: 1,
      metadataVersion: reportMetadataCurrentRevisions.metadataVersion,
    });
    const previous = {
      request: { ...request, contractVersion: 3 },
      page: { ...page, contractVersion: 3, metadataVersion: version },
    };
    if (request.symbol !== symbol || sha(previous) !== contentHash ||
        canonicalizeManifest(previous) !== canonicalizeManifest(payload))
      return { id, instrumentId, version, outcome: 'unproven', reason: '原快照身份或资料摘要不一致' };
    return { id, instrumentId, version, outcome: 'convert',
      contentHash: sha({ request, page }), payload: { request, page } };
  } catch {
    return { id, instrumentId, version, outcome: 'unproven', reason: '原研报筛选或资料需要继续核对' };
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const input = z.array(z.unknown()).parse(JSON.parse(readFileSync(0, 'utf8')));
  const entries = input.map((row) => {
    const { payload, ...entry } = convertReportMetadata(row);
    return entry;
  });
  process.stdout.write(JSON.stringify({
    contract: 'market-external-report-metadata-migration-preview-v1', entries,
  }) + '\n');
}
