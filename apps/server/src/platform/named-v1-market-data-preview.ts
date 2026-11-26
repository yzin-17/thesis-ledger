import { createInterface } from 'node:readline';
import { readMarketWindowMigrationCandidate } from '../market/market-window-evidence-v3.repository.js';
import { readMarketDerivedSeriesV3 } from '../market/market-derived-series-snapshot-v3.js';
import { convertPriceAcquisition } from './named-v1-market-window-conversion.js';

type Window = {
  kind: 'window';
  identityFingerprint: string;
  completeResponse: unknown;
  completeResponseHash: string;
  requestedStart: string;
  requestedEnd: string;
  fetchedAt: string;
  catalogRevision: string;
};
type Derived = { kind: 'derived'; inputFingerprint: string;
  snapshot: Record<string, unknown> };
const entries = [];
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const row = JSON.parse(line) as Window | Derived;
  if (row.kind === 'derived') {
    try {
      if (row.snapshot.contractVersion !== 3) throw new Error('原派生序列合同时序不符');
      readMarketDerivedSeriesV3({ ...row.snapshot, contractVersion: 1 }, row.inputFingerprint);
      entries.push({ kind: row.kind, id: row.inputFingerprint, outcome: 'convert' });
    } catch {
      entries.push({ kind: row.kind, id: row.inputFingerprint,
        outcome: 'unproven', reason: '原派生序列输入引用需要继续核对' });
    }
    continue;
  }
  try {
    const projection = convertPriceAcquisition(row.completeResponse, row.completeResponseHash);
    const candidate = {
      ...row,
      completeResponse: projection.response,
      completeResponseHash: projection.responseHash,
    };
    const verified = readMarketWindowMigrationCandidate(candidate, row.identityFingerprint);
    if (!verified) throw new Error('行情窗口读回为空');
    entries.push({ kind: row.kind, id: row.identityFingerprint, outcome: 'convert',
      responseHash: projection.responseHash });
  } catch (error) {
    entries.push({ kind: row.kind, id: row.identityFingerprint, outcome: 'unproven',
      reason: error instanceof Error ? error.message.slice(0, 120) : '原行情合同或摘要不能核验' });
  }
}
process.stdout.write(JSON.stringify({ contract: 'market-data-migration-preview-v1', entries }) + '\n');
