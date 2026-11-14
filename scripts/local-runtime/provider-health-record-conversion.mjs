import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { providerProbeDetailsSchema } from '../../packages/schemas/dist/index.js';

export function convertHealthRecord(row) {
  assert.equal(row.details?.kind, 'ai_provider_test', '只允许转换旧测试记录');
  const details = row.details;
  const error = details.errorCode ?? row.errorCode;
  const oldStatus = details.status;
  if (
    oldStatus !== undefined &&
    !['healthy', 'degraded', 'down', 'cancelled'].includes(oldStatus)
  ) {
    return { id: row.id, action: 'delete', reason: '未知旧状态' };
  }
  if (details.errorCode && row.errorCode && details.errorCode !== row.errorCode) {
    return { id: row.id, action: 'delete', reason: '错误码矛盾' };
  }
  if (oldStatus === 'cancelled' && error && error !== 'cancelled') {
    return { id: row.id, action: 'delete', reason: '取消状态与错误码矛盾' };
  }
  let status;
  if (oldStatus === 'cancelled' || error === 'cancelled') status = 'cancelled';
  else if (error || oldStatus === 'down') status = 'failed';
  else if (row.state === 'healthy' || row.state === 'degraded') status = 'passed';
  if (
    !status ||
    (row.state === 'healthy' && status !== 'passed') ||
    (oldStatus === 'healthy' && status !== 'passed')
  ) {
    return { id: row.id, action: 'delete', reason: '无法确定一致的探测结果' };
  }
  const next = { ...details, kind: 'ai_provider_probe', status };
  const parsed = providerProbeDetailsSchema.safeParse(next);
  if (!parsed.success) return { id: row.id, action: 'delete', reason: '必要事实缺失或归因无效' };
  return { id: row.id, action: 'convert', details: parsed.data };
}

const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => literal(JSON.stringify(value)) + '::jsonb';

export function healthRecordTransaction(snapshot, actions, commit = false) {
  assert.equal(snapshot.database, 'thesis_ledger', '开发数据库名不匹配');
  assert.equal(snapshot.owner, 'thesis_ledger', '开发数据库 owner 不匹配');
  assert.equal(actions.length, snapshot.rows.length);
  assert.equal(new Set(actions.map((action) => action.id)).size, actions.length);
  const delimiter = '$health_record_' + randomUUID().replaceAll('-', '') + '$';
  assert(!JSON.stringify([snapshot, actions]).includes(delimiter), '事务分隔符冲突');
  const convertedIds = actions
    .filter((action) => action.action === 'convert')
    .map((action) => literal(action.id));
  const unaffected = convertedIds.length ? `id NOT IN (${convertedIds.join(',')})` : 'TRUE';
  const statements = snapshot.rows.map((row, index) => {
    assert.equal(row.details?.kind, 'ai_provider_test');
    const action = actions[index];
    assert.equal(action.id, row.id);
    assert(['convert', 'delete'].includes(action.action));
    const condition = `id=${literal(row.id)} AND to_jsonb(h)=${json(row)}`;
    let mutation;
    if (action.action === 'convert') {
      providerProbeDetailsSchema.parse(action.details);
      mutation = `UPDATE public."ProviderHealthCheck" h SET details=${json(action.details)} WHERE ${condition};`;
    } else mutation = `DELETE FROM public."ProviderHealthCheck" h WHERE ${condition};`;
    return `${mutation}\nGET DIAGNOSTICS affected = ROW_COUNT;\nIF affected <> 1 THEN RAISE EXCEPTION '原记录变化，维护回滚'; END IF;`;
  });
  return `BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public."ProviderHealthCheck" IN SHARE ROW EXCLUSIVE MODE;
DO ${delimiter}
DECLARE affected integer;
BEGIN
IF current_database() <> 'thesis_ledger' OR
 (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'thesis_ledger'
 THEN RAISE EXCEPTION '实际数据库身份不匹配'; END IF;
IF (SELECT count(*) FROM public."ProviderHealthCheck" WHERE details->>'kind'='ai_provider_test') <> ${actions.length}
 THEN RAISE EXCEPTION '旧记录集合变化，维护回滚'; END IF;
${statements.join('\n')}
IF EXISTS (SELECT 1 FROM public."ProviderHealthCheck" WHERE details->>'kind'='ai_provider_test')
 THEN RAISE EXCEPTION '仍有旧记录，维护回滚'; END IF;
IF (SELECT md5(coalesce(string_agg(to_jsonb(h)::text,'' ORDER BY id),'')) FROM public."ProviderHealthCheck" h WHERE ${unaffected}) <> ${literal(snapshot.untouched)}
 THEN RAISE EXCEPTION '非目标记录变化，维护回滚'; END IF;
END ${delimiter};
${commit ? 'COMMIT' : 'ROLLBACK'};
SELECT json_build_object('committed',${commit},'converted',${actions.filter((action) => action.action === 'convert').length},'deleted',${actions.filter((action) => action.action === 'delete').length},'nonTargetRecordsPreserved',true);`;
}
