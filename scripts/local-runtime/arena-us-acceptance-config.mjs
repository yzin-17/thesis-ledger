// 只读导出原比赛与无凭证本地模型配置，供隔离验收使用。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? '');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'), '需要私有验收路径');
const infra = resolve(root, '../thesis-ledger-infra');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
const sql = `SELECT json_build_object('sourceId',m.id,'protocol',m.protocol,
 'sourceState',m.state,'sourceHash',md5(to_jsonb(m)::text),
 'agentsHash',(SELECT md5(string_agg(to_jsonb(a)::text,'' ORDER BY a.id)) FROM "ArenaLiveAgent" a WHERE a."matchId"=m.id),
 'cyclesHash',(SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.id)) FROM "ArenaLiveCycle" c WHERE c."matchId"=m.id),
 'provider',to_jsonb(p)-'encryptedCredentials')
 FROM "ArenaLiveMatch" m JOIN "ProviderConfig" p ON p.name='lmstudio'
 WHERE m.id='91d6e8f0-fcef-4801-ab09-f9c90110479f';`;
const result = JSON.parse(runtime.runtime.dockerSync(['exec', 'thesis-ledger-dev-postgres-1', 'psql', '-XAtq',
  '-U', 'thesis_ledger', '-d', 'thesis_ledger', '-c', sql]));
assert.equal(result.provider.settings.authMode, 'none', '仅允许导出无凭证本地模型');
assert.equal(result.protocol.market, 'US');
assert.equal(result.protocol.entrants.length, 1);
assert.equal(result.protocol.entrants[0].providerId, 'lmstudio');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: 'exported', model: result.protocol.entrants[0].model, sourceWrites: 0, output }));
