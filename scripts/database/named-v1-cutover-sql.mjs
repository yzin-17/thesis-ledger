import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export const originalHead = '20261114010000_journal_period_review_snapshots';
export const namedV1Head = '20261124162500_named_v1_contract_boundary';
const ledgerHead = '20261124143000_named_v1_ledger_envelope';

async function migrationBody(head) {
  const file = new URL(`../../apps/server/prisma/migrations/${head}/migration.sql`, import.meta.url);
  const source = await readFile(file, 'utf8');
  const body = /^BEGIN;\s+([\s\S]*)\s+COMMIT;\s*$/u.exec(source)?.[1];
  assert(body, '具名合同迁移必须具有明确的事务边界');
  return body;
}

export async function namedV1CutoverSql(dataSql, policySql = '') {
  const ledger = await migrationBody(ledgerHead);
  const boundary = await migrationBody(namedV1Head);
  assert(dataSql.includes('verified_StrategyVersion'), '缺少经过转换的 PostgreSQL 报表');
  return `LOCK TABLE "SchemaVersion" IN EXCLUSIVE MODE;
SELECT 1 / count(*) FROM "SchemaVersion" WHERE id=1 AND version='${originalHead}';
ALTER TABLE "MarketBarWindowEvidenceV3" DROP CONSTRAINT "MarketBarWindowEvidenceV3_response_check";
ALTER TABLE "MarketDerivedSeriesSnapshotV3" DROP CONSTRAINT "MarketDerivedSeriesSnapshotV3_snapshot_check";
ALTER TABLE "AiRun" DROP CONSTRAINT "AiRun_research_submission_v2_complete";
ALTER TABLE "ArenaLiveMatch" DROP CONSTRAINT "ArenaLiveMatch_protocol_check";
${dataSql}
${policySql}
${ledger}
${boundary}
`;
}
