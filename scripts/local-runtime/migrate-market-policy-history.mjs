import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { marketRouteCatalogGetEndpointV3, marketRouteCatalogV3Schema } from '@thesis-ledger/schemas';
import { checkOutputDirectory, docker, target } from '../../../thesis-ledger-infra/scripts/state-backup.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { planMarketPolicyHistory, retiredStatus } from './market-policy-history-plan.mjs';

const consumer = 'thesis-ledger';
const database = 'thesis_ledger';
const format = 'market-policy-history-cutover-v1';
const active = 'public."DesiredProviderPolicy"';
const history = 'public."DesiredProviderPolicyRevision"';
const retired = `jsonb_path_exists(p.routes, '$.routes[*] ? (@.key.capability == "${retiredStatus}")')`;
const activeRow = `SELECT to_jsonb(p) FROM ${active} p WHERE consumer = '${consumer}'`;
const candidates = `SELECT p.* FROM ${history} p
  WHERE p.consumer = '${consumer}' AND ${retired}`;
const dependencies = `SELECT 1 FROM pg_constraint WHERE confrelid = '${history}'::regclass
  UNION ALL SELECT 1 FROM pg_trigger WHERE tgrelid = '${history}'::regclass AND NOT tgisinternal`;
const owner = 'SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()';
const quoted = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";

function query(body) {
  const response = docker(['exec', '-i', target + '-postgres-1', 'sh', '-c',
    'PGOPTIONS="-c statement_timeout=30000 -c lock_timeout=3000" exec psql -X -w -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
  { input: body, timeout: 45000 });
  return JSON.parse(response.toString());
}

function readCatalog() {
  const read = `
import os, urllib.request
url = "http://127.0.0.1:8000" + ${JSON.stringify(marketRouteCatalogGetEndpointV3)}
headers = {"Authorization": "Bearer " + os.environ["THESIS_LEDGER_CONTROL_TOKEN"]}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(urllib.request.Request(url, headers=headers), timeout=8) as response:
    print(response.read().decode())
`;
  const raw = docker(['exec', '-i', target + '-dsa-1', 'python', '-B', '-'],
    { input: read, timeout: 12000 });
  return marketRouteCatalogV3Schema.parse(JSON.parse(raw.toString()));
}

function preview() {
  const snapshot = query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('database', current_database(), 'user', current_user, 'owner', (${owner}),
 'active', (${activeRow}), 'referenced', EXISTS (${dependencies}),
 'rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.revision) FROM (${candidates}) p), '[]'::jsonb));
ROLLBACK;`);
  assert.equal(snapshot.database, database);
  assert.equal(snapshot.user, database);
  assert.equal(snapshot.owner, database);
  assert(!snapshot.referenced, '历史策略还有数据库外键或触发器，停止处理');
  assert(snapshot.active?.routes?.storageVersion === 'market-routing-policy-v1' &&
    snapshot.active.routes.routes.every((route) => route.key.capability !== retiredStatus),
  '生效策略须已切换到具名 V1');
  assert(snapshot.rows.every((row) => row.revision < snapshot.active.revision),
    '转换目标须早于当前修订');

  const catalog = readCatalog();
  return { format, target, database, catalogRevision: catalog.catalogRevision, active: snapshot.active,
    revisions: planMarketPolicyHistory(snapshot.rows, catalog) };
}

function execute(plan, command) {
  const before = plan.revisions.map(({ before }) => before);
  const changes = plan.revisions.map(({ before, nextRoutes }) => ({
    id: before.id, routes: nextRoutes,
  }));
  const converted = changes.filter(({ routes }) => routes !== null).length;
  const deleted = changes.length - converted;
  return query(`BEGIN;
SET LOCAL standard_conforming_strings = on;
DO $$
BEGIN
  IF current_database() <> '${database}' OR current_user <> '${database}' OR
     (${owner}) <> '${database}' THEN RAISE EXCEPTION '数据库或 owner 变化'; END IF;
  PERFORM 1 FROM ${active} WHERE consumer = '${consumer}' FOR UPDATE;
END $$;
LOCK TABLE ${history} IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF (${activeRow}) IS DISTINCT FROM ${quoted(plan.active)} OR EXISTS (${dependencies}) OR
    (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.revision), '[]'::jsonb) FROM (${candidates}) p)
    IS DISTINCT FROM ${quoted(before)} THEN
      RAISE EXCEPTION '历史修订或生效策略已偏离预览';
  END IF;
END $$;
CREATE TEMP TABLE market_policy_history_plan ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset(${quoted(changes)}) AS item(id uuid, routes jsonb);
UPDATE ${history} p SET routes = jsonb_set(p.routes, '{routes}', item.routes)
 FROM market_policy_history_plan item WHERE p.id=item.id AND item.routes IS NOT NULL;
DELETE FROM ${history} p USING market_policy_history_plan item WHERE p.id=item.id AND item.routes IS NULL;
DO $$
BEGIN
  IF EXISTS (${candidates}) OR
    (SELECT count(*) FROM market_policy_history_plan item JOIN ${history} p ON p.id=item.id
      WHERE p.consumer='${consumer}' AND p.routes->'routes'=item.routes) <> ${converted} OR
    EXISTS (SELECT 1 FROM market_policy_history_plan item JOIN ${history} p ON p.id=item.id
      WHERE item.routes IS NULL) THEN RAISE EXCEPTION '历史策略写入对账失败'; END IF;
END $$;
SELECT jsonb_build_object('mode', '${command}', 'mapped', ${converted}, 'deleted', ${deleted},
  'activeRevision', ${plan.active.revision});
${command === 'apply' ? 'COMMIT' : 'ROLLBACK'};`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { directory: { type: 'string' }, confirm: { type: 'string' } },
});
const [command] = positionals;
assert(positionals.length === 1 && ['preview', 'rehearse', 'apply'].includes(command),
  '用法：migrate-market-policy-history.mjs <preview|rehearse|apply> --directory <私有目录> --confirm thesis-ledger-dev/thesis_ledger');
assert.equal(values.confirm, target + '/' + database);
assert(values.directory && isAbsolute(values.directory), '须提供绝对目录');
assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '须通过 infra 持锁维护入口运行');

const directory = resolve(values.directory);
const file = join(directory, 'plan.json');
const plan = preview();
if (command === 'preview') {
  checkOutputDirectory(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
  const removed = plan.revisions.filter(({ nextRoutes }) => nextRoutes === null);
  console.log(JSON.stringify({ mode: command, file, activeRevision: plan.active.revision,
    catalogRevision: plan.catalogRevision, mapped: plan.revisions.length - removed.length,
    deleted: removed.map(({ before, blockers }) => ({ revision: before.revision, blockers })) }));
} else {
  assert(isDeepStrictEqual(plan, JSON.parse(readFileSync(file, 'utf8'))), '实时清单已偏离预览');
  const result = execute(plan, command);
  console.log(JSON.stringify({ ...result, file }));
}
