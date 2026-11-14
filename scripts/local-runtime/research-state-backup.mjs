import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as storage from '../../../thesis-ledger-infra/scripts/state-backup.mjs';
export * from '../../../thesis-ledger-infra/scripts/state-backup.mjs';

const { target } = storage;
const format = 'thesis-ledger-research-state-v1';

export function sql(container, query, database) {
  assert(database === undefined || database === 'restore_db', '隔离库名必须为固定恢复目标');
  return storage.sql(container, query, database ? { owner: 'restore_owner', database } : undefined);
}

export const protectedTables = ['Account', 'AccountLedgerState', 'LedgerEvent', 'PortfolioSnapshot', 'Strategy', 'StrategyVersion', 'BacktestJob'];
export const protectionSql = `SELECT json_build_object(
  'database',current_database(), 'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
  'head',(SELECT version FROM "SchemaVersion" WHERE id=1),
  'activeBacktests',(SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running')),
  'tables',json_build_object(${protectedTables.map(t => `'${t}',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM "${t}" t)`).join(',')}),
  'runs',(SELECT coalesce(json_agg(json_build_object('id',id,'checksum',"resultChecksum") ORDER BY id),'[]'::json)
    FROM "BacktestJob" WHERE status='succeeded' AND result->>'schemaVersion'='3'));`;


export function assertResearchState(state) {
  const manifest = { state };
  assert.equal(manifest.state.database, 'thesis_ledger');
  assert.equal(manifest.state.owner, 'thesis_ledger');
  assert.equal(manifest.state.activeBacktests, 0);
  assert(/^\d{14}_[a-z0-9_]+$/.test(manifest.state.head));
  assert(Array.isArray(manifest.state.runs));
  for (const run of manifest.state.runs) {
    assert(/^[a-f0-9-]{36}$/.test(run.id) && /^[a-f0-9]{16}$/.test(run.checksum));
  }
}

export function assertManifest(manifest) {
  storage.assertManifest(manifest, { format });
  assertResearchState(manifest.state);
}
export async function verifyBundle(path) {
  const manifest = await storage.verifyBundle(path, { format });
  assertResearchState(manifest.state);
  return manifest;
}
export const backup = path => storage.backup(path, { protectionSql, assertState: assertResearchState, format });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, flag, selected, outputFlag, path] = process.argv.slice(2);
  assert.equal(flag, '--target'); assert.equal(selected, target); assert.equal(outputFlag, '--output');
  assert(['backup', 'verify'].includes(mode));
  const result = mode === 'backup' ? await backup(path) : await verifyBundle(path);
  console.log(JSON.stringify({ mode, path, files: result.files, runCount: result.state.runs.length, images: result.images }));
}
