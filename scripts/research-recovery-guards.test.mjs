import assert from 'node:assert/strict';
import test from 'node:test';
import { controlledOrigin, recoveryDatabaseUrl } from './research-recovery-guards.mjs';

test('进程驱动仅接受固定隔离数据库身份，拒绝目标库及远端', () => {
  assert.equal(recoveryDatabaseUrl('postgresql://restore_owner@127.0.0.1:5432/restore_db').pathname, '/restore_db');
  for (const url of ['postgresql://restore_owner@127.0.0.1:5432/thesis_ledger',
    'postgresql://thesis_ledger@127.0.0.1:5432/restore_db',
    'postgresql://restore_owner@example.com:5432/restore_db',
    'postgresql://restore_owner@127.0.0.1:5432/restore_db?options=-csearch_path=other'])
    assert.throws(() => recoveryDatabaseUrl(url));
});

test('受控模型仅接受无鉴权的本机 HTTP 原点', () => {
  assert.equal(controlledOrigin('http://127.0.0.1:43210'), 'http://127.0.0.1:43210');
  for (const url of ['https://127.0.0.1:43210', 'http://example.com:43210',
    'http://127.0.0.1:43210/v1', 'http://user:secret@127.0.0.1:43210', 'http://127.0.0.1:43210?upstream=remote'])
    assert.throws(() => controlledOrigin(url));
});
