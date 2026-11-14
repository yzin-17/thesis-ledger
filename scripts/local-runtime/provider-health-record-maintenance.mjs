import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sql, docker, inspect, checkOutputDirectory, target } from './research-state-backup.mjs';
import {
  convertHealthRecord,
  healthRecordTransaction,
} from './provider-health-record-conversion.mjs';

const query = `SELECT json_build_object(
 'database',current_database(),
 'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'rows',(SELECT coalesce(json_agg(h ORDER BY id),'[]'::json) FROM public."ProviderHealthCheck" h WHERE details->>'kind'='ai_provider_test'),
 'untouched',(SELECT md5(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY id),'')) FROM public."ProviderHealthCheck" h WHERE details->>'kind' IS DISTINCT FROM 'ai_provider_test'))`;

function transaction(container, input) {
  try {
    return JSON.parse(
      docker(
        [
          'exec',
          '-i',
          container,
          'sh',
          '-c',
          'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq',
        ],
        { input },
      ).toString(),
    );
  } catch (error) {
    const message = String(error.stderr ?? '')
      .split('\n')
      .find((line) => line.includes('ERROR:'));
    throw new Error(message ?? '健康记录事务执行失败');
  }
}

export function maintenanceArguments(args) {
  const { values } = parseArgs({
    args,
    options: {
      mode: { type: 'string', default: 'plan' },
      target: { type: 'string' },
      output: { type: 'string' },
    },
  });
  assert.equal(values.target, target, '必须精确指定开发目标');
  assert(['plan', 'rehearse', 'apply'].includes(values.mode), '维护模式无效');
  if (values.mode !== 'plan') assert(values.output, '执行或演练必须指定私有备份目录');
  return values;
}

export async function maintainHealthRecords(options) {
  assert.equal(options.target, target);
  assert(['plan', 'rehearse', 'apply'].includes(options.mode));
  const container = inspect(`${target}-postgres-1`);
  assert.equal(container.Name, `/${target}-postgres-1`);
  assert.equal(container.Config.Labels['com.docker.compose.project'], target);
  assert.equal(container.Config.Labels['com.docker.compose.service'], 'postgres');
  assert(container.State.Running && container.State.Health?.Status === 'healthy');
  const before = sql(container.Id, query);
  assert.equal(before.database, 'thesis_ledger');
  assert.equal(before.owner, 'thesis_ledger');
  const actions = before.rows.map(convertHealthRecord);
  const result = {
    target,
    mode: options.mode,
    oldRecords: actions.length,
    converted: actions.filter((action) => action.action === 'convert').length,
    deleted: actions.filter((action) => action.action === 'delete').length,
    deletions: actions.filter((action) => action.action === 'delete'),
    realModelRequests: 0,
  };
  if (options.mode === 'plan') return result;
  checkOutputDirectory(options.output);
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(options.output, 'before.json'), JSON.stringify(before), {
    mode: 0o600,
    flag: 'wx',
  });
  writeFileSync(resolve(options.output, 'plan.json'), JSON.stringify(result), {
    mode: 0o600,
    flag: 'wx',
  });
  if (options.mode === 'rehearse' && before.rows.length > 0) {
    const changed = structuredClone(before);
    changed.rows.at(-1).provider = 'controlled-concurrent-change';
    assert.throws(
      () => transaction(container.Id, healthRecordTransaction(changed, actions)),
      /原记录变化/,
    );
    assert.deepEqual(sql(container.Id, query), before, '逐行冲突未回滚前序修改');
    const shortened = { ...before, rows: before.rows.slice(1) };
    assert.throws(
      () => transaction(container.Id, healthRecordTransaction(shortened, actions.slice(1))),
      /旧记录集合变化/,
    );
    assert.deepEqual(sql(container.Id, query), before, '集合冲突改变原数据');
  }
  // 原件先落盘；SQL 自身再次检查集合及逐行原值，任何变化均使整笔事务回滚。
  const mutation = transaction(
    container.Id,
    healthRecordTransaction(before, actions, options.mode === 'apply'),
  );
  const after = sql(container.Id, query);
  if (options.mode === 'rehearse') assert.deepEqual(after, before, '演练回滚后原数据不一致');
  else {
    assert.equal(after.rows.length, 0, '仍有旧记录');
    assert.equal(mutation.nonTargetRecordsPreserved, true);
  }
  const report = {
    ...result,
    ...mutation,
    originalRecordsBackedUp: true,
    remainingOldRecords: after.rows.length,
  };
  writeFileSync(resolve(options.output, 'report.json'), JSON.stringify(report, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    JSON.stringify(
      await maintainHealthRecords(maintenanceArguments(process.argv.slice(2))),
      null,
      2,
    ),
  );
}
