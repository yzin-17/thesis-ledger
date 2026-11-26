import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { backupDatabaseForUpgrade } from '../../apps/server/src/platform/database-upgrade-backup.ts';
import { createUpgradeIsolation, runUpgradeIsolationSql } from '../../apps/server/src/platform/database-upgrade-isolation.ts';
import { restoreDatabaseUpgradeBackup } from '../../apps/server/src/platform/database-upgrade-restore.ts';
import { namedV1StatusPolicySql } from '../../apps/server/src/platform/named-v1-status-policy.ts';
import { namedV1CutoverSql, namedV1Head, originalHead } from './named-v1-cutover-sql.mjs';
import { runApplicationCommand } from '../../../thesis-ledger-infra/scripts/application-contract.mjs';
import { checksum, verifyBundle } from '../../../thesis-ledger-infra/scripts/state-backup.mjs';

const [sourceArtifacts, evidence, reviewedResearchId, recoveredBundle] = process.argv.slice(2);
assert([5, 6].includes(process.argv.length) && [sourceArtifacts, evidence, ...(recoveredBundle ? [recoveredBundle] : [])].every(isAbsolute)
  && /^[a-f0-9-]{36}$/.test(reviewedResearchId),
  '需要提供制品备份目录、全新的私有演练目录及已审阅的单条研究 ID');
assert((await stat(join(sourceArtifacts, 'artifacts'))).isDirectory());
await mkdir(evidence, { mode: 0o700 });
const stagedArtifacts = join(evidence, 'converted');
await mkdir(stagedArtifacts, { mode: 0o700 });
const target = { databaseName: 'thesis_ledger', ownerName: 'thesis_ledger' };
const source = 'thesis-ledger-dev-postgres-1';
const file = join(evidence, 'strategy-and-market.sql');

const statusPlanPath = join(evidence, 'status-plan.json');
const dsaApp = fileURLToPath(new URL('../../../daily-stock-analysis/', import.meta.url));
const sourceManifest = recoveredBundle
  ? await verifyBundle(recoveredBundle, { format: 'thesis-ledger-named-v1-state-v1' })
  : undefined;
const dump = sourceManifest?.files.find(({ name }) => name === 'postgres.dump');
const backup = dump
  ? { sourceContainer: source, target, outputPath: join(recoveredBundle, dump.name),
      backupBytes: dump.bytes, backupSha256: dump.sha256 }
  : await backupDatabaseForUpgrade(source, target, join(evidence, 'source.dump'));
const isolation = await createUpgradeIsolation(source, target);
try {
  await restoreDatabaseUpgradeBackup(backup, isolation.container, isolation.isolationToken);
  const sql = (input) => runUpgradeIsolationSql(isolation.container, target, input, isolation.isolationToken);
  const head = await sql('SELECT version FROM "SchemaVersion" WHERE id=1;');
  assert.equal(head, originalHead);
  const policyRevision = Number(await sql('SELECT revision FROM "DesiredProviderPolicy";'));
  assert(Number.isSafeInteger(policyRevision) && policyRevision > 0);
  const witness = `SELECT jsonb_build_object(
    'strategyOwners', (SELECT md5(coalesce(string_agg((to_jsonb(s)-'schemaVersion')::text,'' ORDER BY id),'')) FROM "Strategy" s),
    'strategies', (SELECT md5(coalesce(string_agg((to_jsonb(s)-'schemaVersion'-'schema')::text,'' ORDER BY id),'')) FROM "StrategyVersion" s),
    'runs', (SELECT md5(coalesce(string_agg((to_jsonb(b)-'mode'-'input'-'runConfig'-'snapshotId'-'snapshotManifest'-'result'-'resultChecksum')::text,'' ORDER BY id),'')) FROM "BacktestJob" b),
    'providers', (SELECT md5(coalesce(string_agg((to_jsonb(p)-'settings')::text ||
      coalesce((settings-'executionRoutes')::text,'null') || coalesce((
        SELECT jsonb_agg(route-'contract' ORDER BY slot)::text
        FROM jsonb_array_elements(settings->'executionRoutes') WITH ORDINALITY AS routes(route,slot)
      ),'null'),'' ORDER BY id),'')) FROM "ProviderConfig" p),
    'routingPolicy', (SELECT md5(coalesce(string_agg(fact::text,'' ORDER BY dataSet, consumer, revision),'')) FROM (
      SELECT 'current' AS dataSet, consumer, revision, jsonb_build_array(
        to_jsonb(p)-'routes'-'effectiveProjection', routes-'storageVersion', "effectiveProjection"-'contractVersion') AS fact
        FROM "DesiredProviderPolicy" p ${recoveredBundle ? 'WHERE false' : ''}
      UNION ALL
      SELECT 'history', consumer, revision, jsonb_build_array(
        to_jsonb(p)-'routes'-'effectiveProjection', routes-'storageVersion', "effectiveProjection"-'contractVersion')
        FROM "DesiredProviderPolicyRevision" p WHERE revision <= ${policyRevision}
    ) routes),
    'experiments', (SELECT md5(coalesce(string_agg((to_jsonb(o)-'runConfig'-'dataFingerprint'
      -'frozenDataFingerprints')::text,'' ORDER BY id),'')) FROM "OptimizationExperiment" o),
    'candidates', (SELECT md5(coalesce(string_agg((to_jsonb(o)-'executionHash')::text, '' ORDER BY id),''))
      FROM "OptimizationCandidate" o),
    'adoptions', (SELECT md5(coalesce(string_agg((to_jsonb(o)-'candidateHash')::text, '' ORDER BY id),''))
      FROM "OptimizationAdoption" o),
    'ledger', (SELECT md5(coalesce(string_agg((to_jsonb(e)-'envelopeVersion')::text,'' ORDER BY id),'')) FROM "LedgerEvent" e),
    'portfolio', (SELECT md5(coalesce(string_agg((to_jsonb(p)-'payloadVersion')::text,'' ORDER BY id),'')) FROM "PortfolioSnapshot" p),
    'arena', jsonb_build_object(
      'cycles',(SELECT md5(coalesce(string_agg(md5((to_jsonb(c)#-'{input,protocol,version}')::text),'' ORDER BY id),'')) FROM "ArenaLiveCycle" c),
      'live',(SELECT md5(coalesce(string_agg((to_jsonb(m)#-'{protocol,version}')::text,'' ORDER BY id),'')) FROM "ArenaLiveMatch" m),
      'daily',(SELECT md5(coalesce(string_agg((to_jsonb(m)#-'{protocol,version}')::text,'' ORDER BY id),'')) FROM "ModelArena" m),
      'agents',(SELECT md5(coalesce(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),'')) FROM "ArenaLiveAgent" a),
      'valuations',(SELECT md5(coalesce(string_agg(md5(to_jsonb(v)::text),'' ORDER BY id),'')) FROM "ArenaLiveValuation" v)
    ));`;
  const before = await sql(witness);
  const sourceGuard = `SELECT md5(string_agg(fact,'' ORDER BY fact)) FROM (
    SELECT 'head:' || version AS fact FROM "SchemaVersion" WHERE id=1
    UNION ALL
    SELECT 'tables:' || facts.value::text FROM (${witness.trim().replace(/;$/u, '')}) AS facts(value)
    UNION ALL SELECT 'policy:' || md5(to_jsonb(p)::text) FROM "DesiredProviderPolicy" p
    UNION ALL SELECT 'work:' || (SELECT count(*) FROM "AiRun" WHERE status IN ('queued','running'))
      || '/' || (SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running'))
      || '/' || (SELECT count(*) FROM "ArenaLiveCycle" WHERE state='running' OR reservation->>'settled'='false')
  ) facts;`.replace(
    "'tables:' || facts.value::text", "'tables:' || (facts.value #- '{arena,valuations}')::text",
  );
  const expectedSource = await sql(sourceGuard);
  const exportRows = spawn('docker', [
    'exec', '-i', isolation.container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', target.ownerName, '-d', target.databaseName,
  ], { stdio: ['pipe', 'pipe', 'ignore'] });
  const tsx = new URL('../../apps/server/node_modules/.bin/tsx', import.meta.url);
  const planner = spawn(tsx.pathname, [
    new URL('../../apps/server/src/platform/named-v1-postgres-stage.ts', import.meta.url).pathname,
    sourceArtifacts, stagedArtifacts, file, reviewedResearchId, ...(recoveredBundle ? [statusPlanPath] : []),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = (child) => new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('隔离读取或转换未完成')));
  });
  try {
    const reads = Promise.all([exited(exportRows), exited(planner), pipeline(exportRows.stdout, planner.stdin)]);
    exportRows.stdin.end(await readFile(new URL('./named-v1-strategy-market-selection.sql', import.meta.url)));
    await reads;
  } finally {
    for (const child of [exportRows, planner]) if (child.exitCode === null) child.kill();
  }
  let policySql = '', effective;
  if (recoveredBundle) {
    const staged = JSON.parse(runApplicationCommand(dsaApp, ['stage-named-v1-state',
      join(recoveredBundle, 'dsa.sqlite'), '--staging-copy', join(evidence, 'dsa.sqlite'),
      '--status-plan', statusPlanPath]).toString());
    assert.equal(staged.contract, 'dsa-control-policy-migration-stage-v1');
    effective = staged.effective;
    policySql = namedV1StatusPolicySql(JSON.parse(await readFile(statusPlanPath, 'utf8')), effective);
  }
  const patch = await namedV1CutoverSql(await readFile(file, 'utf8'), policySql);
  const allStrategies = 'SELECT count(*) FROM "StrategyVersion" WHERE schema->>\'schemaVersion\' = \'strategy-definition-v1\';';
  assert.equal(await sql(allStrategies), '0');
  await assert.rejects(sql('BEGIN;\n' + patch + '\nSELECT 1 / 0;\nCOMMIT;'));
  assert.equal(await sql(allStrategies), '0', '失败后策略改动没有回滚');
  assert.equal(await sql('SELECT version FROM "SchemaVersion" WHERE id=1;'), head);
  assert.equal(await sql(witness), before);
  assert.equal(await sql(`SELECT count(*) FROM "AiRun" WHERE id = '${reviewedResearchId}';`), '1');
  await sql('BEGIN;\n' + patch + '\nCOMMIT;');
  assert.equal(await sql('SELECT version FROM "SchemaVersion" WHERE id=1;'), namedV1Head);
  assert.equal(await sql(witness), before, '转换改动了受保护的非合同事实');
  if (effective) {
    const actual = await sql('SELECT "effectiveProjection"::text FROM "DesiredProviderPolicy";');
    assert.deepEqual(JSON.parse(actual), effective);
    assert.equal(await sql(`SELECT count(*) FROM "DesiredProviderPolicyRevision" WHERE revision=${effective.revision};`), '1');
  }
  assert.equal(await sql(`SELECT
    NOT EXISTS(SELECT 1 FROM "Strategy" WHERE "schemaVersion" <> 1)
    AND NOT EXISTS(SELECT 1 FROM "StrategyVersion" WHERE "schemaVersion" <> 1 OR schema->>'schemaVersion' IS DISTINCT FROM 'strategy-definition-v1')
    AND NOT EXISTS(SELECT 1 FROM "BacktestJob" WHERE mode <> 'frozen' OR input->'contractVersion' IS DISTINCT FROM '1'::jsonb)
    AND NOT EXISTS(SELECT 1 FROM "MarketBarWindowEvidenceV3" WHERE "completeResponse" IS NOT NULL
       AND "completeResponse"->'contractVersion' IS DISTINCT FROM '1'::jsonb)
    AND NOT EXISTS(SELECT 1 FROM "AiRun" WHERE id = '${reviewedResearchId}' OR
       ("modelMetadata" ? 'frozenResearch' AND
        "modelMetadata"#>>'{frozenResearch,version}' IS DISTINCT FROM 'research-frozen-input-v1'))
    AND NOT EXISTS(SELECT 1 FROM "AiToolCall" WHERE "aiRunId" = '${reviewedResearchId}')
    AND NOT EXISTS(
      SELECT 1 FROM "ProviderConfig" p, jsonb_array_elements(p.settings->'executionRoutes') r
      WHERE r#>>'{contract,version}' IN (
        'authoring-analysis-v1','authoring-generation-v2','authoring-generation-v5',
        'authoring-modification-v2','authoring-modification-v5','research-generation-v2',
        'arena-live-research-v4','arena-live-research-v6','strategy-discovery-v2','strategy-discovery-v5'
      ))
    AND NOT EXISTS(SELECT 1 FROM (
      SELECT routes,"effectiveProjection" FROM "DesiredProviderPolicy" UNION ALL
      SELECT routes,"effectiveProjection" FROM "DesiredProviderPolicyRevision"
    ) policies
      WHERE routes->>'storageVersion' IS DISTINCT FROM 'market-routing-policy-v1'
      OR ("effectiveProjection" IS NOT NULL
        AND "effectiveProjection" IS DISTINCT FROM 'null'::jsonb
        AND "effectiveProjection"->'contractVersion' IS DISTINCT FROM '1'::jsonb))
    AND NOT EXISTS(SELECT 1 FROM "OptimizationExperiment"
      WHERE "runConfig"->>'schemaVersion' IS DISTINCT FROM 'backtest-trade-config-v1')
    AND NOT EXISTS(SELECT 1 FROM "OptimizationAdoption" a JOIN "OptimizationCandidate" c
      ON c.id=a."candidateId" WHERE a."candidateHash" IS DISTINCT FROM c."executionHash")
    AND NOT EXISTS(SELECT 1 FROM "ArenaLiveMatch" WHERE protocol->>'version' IS DISTINCT FROM 'arena-live-match-protocol-v1')
    AND NOT EXISTS(SELECT 1 FROM "ArenaLiveCycle" WHERE input IS NOT NULL
      AND input#>>'{protocol,version}' IS DISTINCT FROM 'arena-live-match-protocol-v1')
    AND NOT EXISTS(SELECT 1 FROM "ModelArena" WHERE protocol->>'version' IS DISTINCT FROM 'arena-historical-match-protocol-v1');`), 't');
  const receipt = { fromHead: head, toHead: namedV1Head, database: 'isolated', strategyAndMarket: 'verified',
    activeRoutingRevision: effective?.revision, failedWriteRolledBack: true };
  if (sourceManifest && effective) {
    const joint = JSON.parse(await readFile(join(dirname(recoveredBundle), 'receipt.json'), 'utf8'));
    assert.equal(joint.format, sourceManifest.format);
    assert.equal(joint.head, head);
    assert(joint.postgresFailureRolledBack && joint.backtestReplay && joint.sqlite === 'verified');
    const sqlFile = join(evidence, 'apply.sql');
    await writeFile(sqlFile, 'BEGIN;\n' + patch + '\nCOMMIT;\n', { flag: 'wx', mode: 0o600 });
    const copy = join(evidence, 'dsa.sqlite');
    const archive = join(recoveredBundle, 'backtest.tar');
    const sourceDsaArchive = join(recoveredBundle, 'dsa-data.tar');
    const sourceSqlite = join(recoveredBundle, 'dsa.sqlite');
    const describe = async (path) => ({ path, sha256: await checksum(path) });
    const sqliteName = 'stock_analysis.db';
    const sqliteFiles = ['', '-wal', '-shm'].map((suffix) => sqliteName + suffix);
    const treeProgram = runApplicationCommand(dsaApp, ['state-tree-program']);
    const treeDigest = (root, ...ignored) => execFileSync('python3', ['-', root, ...ignored], { input: treeProgram, encoding: 'utf8' }).trim();
    const sourceRows = await sql(`SELECT json_build_object('matches', (SELECT count(*) FROM "ArenaLiveMatch"),
      'historical', (SELECT count(*) FROM "ModelArena"), 'cycles', (SELECT count(*) FROM "ArenaLiveCycle"),
      'pending', (SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM "ArenaLiveCycle" WHERE state='pending'));`);
    const redis = await describe(join(dirname(recoveredBundle), 'arena-redis.json'));
    assert.equal(redis.sha256, joint.redisHash);
    await writeFile(join(evidence, 'activation.json'), JSON.stringify({
      format: 'thesis-ledger-state-switch-v1', target: 'thesis-ledger-dev',
      databaseName: target.databaseName, ownerName: target.ownerName,
      sourceImages: { ...sourceManifest.images, redis: joint.images.redis },
      sourceGuard, expectedSource, targetHead: namedV1Head,
      schemaHeadSql: 'SELECT version FROM "SchemaVersion" WHERE id=1;',
      statusRevision: effective.revision, arena: JSON.parse(sourceRows),
      migration: await describe(sqlFile), sqlite: await describe(copy),
      sqliteSnapshot: await describe(sourceSqlite), dsaArchive: await describe(sourceDsaArchive),
      backtestArchive: await describe(archive), convertedBacktest: stagedArtifacts,
      sqliteName,
      dsaFileTree: treeDigest(join(dirname(sourceArtifacts), 'dsa'), ...sqliteFiles),
      backtestFileTree: treeDigest(sourceArtifacts),
      convertedFileTree: treeDigest(stagedArtifacts),
      redis,
      redisNamespace: 'thesis-ledger:queue:v1:arena:',
      redisTransientKeys: ['live', 'rounds', 'weeklies'].map((name) => 'thesis-ledger:queue:v1:arena:' + name + ':stalled-check'),
    }, null, 2), { flag: 'wx', mode: 0o600 });
  }
  await writeFile(join(evidence, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(receipt));
} finally {
  await isolation.dispose();
}
